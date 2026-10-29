import { useCallback, useMemo, useRef, useState } from "react";
import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  isWorkspaceAdminRole,
  WORKSPACE_MEMBER_LIST_MAX,
  type WorkspaceMemberResponse,
  type WorkspaceRole,
} from "@repo/contracts";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import {
  MembersListView,
  type MembersListState,
} from "../../../members/MembersListView";
import { memberDisplayName } from "../../../members/memberListView";
import { RoleSelectCell } from "../../../members/RoleSelectCell";
import { WORKSPACE_ROLE_SCHEME } from "../../../members/roleScheme";
import { AddMembersModal } from "./AddMembersModal";
import { ChangeWorkspaceRoleModal } from "./ChangeWorkspaceRoleModal";
import { useWorkspaceMembersQuery } from "./useWorkspaceMembersQuery";

export function MembersSettingsPage() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { state, reload } = useWorkspaceMembersQuery(workspace.slug);
  const [addModalOpened, setAddModalOpened] = useState(false);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    member: WorkspaceMemberResponse;
    toRole: WorkspaceRole;
  } | null>(null);

  const selectRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const canSeeEmail = workspace.permissions.includes(
    "workspace.members.email.view",
  );
  const canAddMember = workspace.permissions.includes("workspace.members.add");

  const handleFocusRestore = useCallback((userId: string) => {
    requestAnimationFrame(() => {
      const el = selectRefs.current.get(userId);
      if (el && document.contains(el)) {
        el.focus();
      } else {
        const filtersBtn = document.querySelector<HTMLButtonElement>(
          'button[data-role-filter], button[aria-label="Filter by role"]',
        );
        filtersBtn?.focus();
      }
    });
  }, []);

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
        roleControl={(m, roleHint) => {
          if (!m.assignableRoles || m.assignableRoles.length <= 1) {
            return null;
          }
          return (
            <RoleSelectCell
              ref={(el) => {
                if (el) selectRefs.current.set(m.userId, el);
                else selectRefs.current.delete(m.userId);
              }}
              value={m.role}
              options={m.assignableRoles}
              labels={WORKSPACE_ROLE_SCHEME.labels}
              memberName={memberDisplayName(m)}
              description={roleHint}
              onRequestChange={(next) => {
                setRoleChangeTarget({ member: m, toRole: next });
              }}
            />
          );
        }}
        alerts={
          showNoActiveAdmin ? (
            <Alert color="red" role="alert">
              {t("workspace:settings.members.noActiveAdmin")}
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

      <ChangeWorkspaceRoleModal
        opened={!!roleChangeTarget}
        member={roleChangeTarget?.member ?? null}
        toRole={roleChangeTarget?.toRole ?? null}
        slug={workspace.slug}
        onClose={() => {
          const targetUserId = roleChangeTarget?.member.userId;
          setRoleChangeTarget(null);
          if (targetUserId) {
            handleFocusRestore(targetUserId);
          }
        }}
      />
    </>
  );
}
