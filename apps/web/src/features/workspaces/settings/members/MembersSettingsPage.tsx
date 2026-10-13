import { useMemo, useState } from "react";
import { Alert } from "@mantine/core";
import {
  isWorkspaceAdminRole,
  WORKSPACE_MEMBER_LIST_MAX,
  type WorkspaceMemberResponse,
} from "@repo/contracts";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import {
  MembersListView,
  type MembersListState,
} from "../../../members/MembersListView";
import { WORKSPACE_ROLE_SCHEME } from "../../../members/roleScheme";
import { AddMembersModal } from "./AddMembersModal";
import { useWorkspaceMembersQuery } from "./useWorkspaceMembersQuery";

export function MembersSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const { state, reload } = useWorkspaceMembersQuery(workspace.slug);
  const [addModalOpened, setAddModalOpened] = useState(false);

  const canSeeEmail = workspace.permissions.includes(
    "workspace.members.email.view",
  );
  const canAddMember = workspace.permissions.includes("workspace.members.add");

  const listViewState: MembersListState<WorkspaceMemberResponse> =
    useMemo(() => {
      if (state.status === "loading") return { status: "loading" };
      if (state.status === "error") return { status: "error", retry: reload };
      return {
        status: "ready",
        members: state.data.members,
        total: state.data.total,
        truncated: state.data.truncated,
        listMax: WORKSPACE_MEMBER_LIST_MAX,
      };
    }, [state, reload]);

  const hasActiveAdmin =
    state.status === "ready" &&
    state.data.members
      .filter((m) => isWorkspaceAdminRole(m.role))
      .some((m) => m.accountActive);
  const showNoActiveAdmin =
    state.status === "ready" && !state.data.truncated && !hasActiveAdmin;

  return (
    <>
      <MembersListView
        scheme={WORKSPACE_ROLE_SCHEME}
        state={listViewState}
        canSeeEmail={canSeeEmail}
        canAddMember={canAddMember}
        onAddMember={() => setAddModalOpened(true)}
        alerts={
          showNoActiveAdmin ? (
            <Alert color="red" role="alert">
              No active Admin. Ask your instance admin for help.
            </Alert>
          ) : undefined
        }
      />

      {state.status === "ready" && (
        <AddMembersModal
          opened={addModalOpened}
          onClose={() => setAddModalOpened(false)}
          slug={workspace.slug}
          addableRoles={state.data.addableRoles}
          onSuccess={reload}
        />
      )}
    </>
  );
}
