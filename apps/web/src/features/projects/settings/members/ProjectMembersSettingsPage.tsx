import { useMemo, useState } from "react";
import { Button, Stack, Text } from "@mantine/core";
import {
  PROJECT_MEMBER_LIST_MAX,
  type ProjectMemberResponse,
} from "@repo/contracts";
import {
  MembersListView,
  type MembersListState,
} from "../../../members/MembersListView";
import { PROJECT_ROLE_SCHEME } from "../../../members/roleScheme";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useCurrentProject } from "../../detail/currentProjectContext";
import { AddProjectMembersModal } from "./AddProjectMembersModal";
import {
  NO_MEMBERS_YET,
  ROLE_LIMITED_TOOLTIP,
  WORKSPACE_ADMINS_NOTE,
} from "./projectMembersMessages";
import { useProjectMembers } from "./useProjectMembers";

export function ProjectMembersSettingsPage() {
  const { project } = useCurrentProject();
  const { workspace } = useCurrentWorkspace();
  const [modalOpened, setModalOpened] = useState(false);

  const query = useProjectMembers(
    workspace.slug,
    project?.identifier ?? "",
  );

  const canSeeEmail = workspace.permissions.includes(
    "workspace.members.email.view",
  );
  const canAddMember = Boolean(
    query.data && query.data.addableRoles.length > 0,
  );

  const listViewState: MembersListState<ProjectMemberResponse> = useMemo(() => {
    if (query.isLoading) return { status: "loading" };
    if (query.isError || !query.data) {
      return { status: "error", retry: () => void query.refetch() };
    }
    return {
      status: "ready",
      members: query.data.members,
      total: query.data.total,
      truncated: query.data.truncated,
      listMax: PROJECT_MEMBER_LIST_MAX,
    };
  }, [query]);

  if (!project) {
    return null;
  }

  const emptyState = (
    <Stack align="center" gap="sm">
      <Text c="dimmed">{NO_MEMBERS_YET}</Text>
      {canAddMember && (
        <Button variant="light" onClick={() => setModalOpened(true)}>
          Add member
        </Button>
      )}
    </Stack>
  );

  return (
    <>
      <MembersListView
        scheme={PROJECT_ROLE_SCHEME}
        state={listViewState}
        canSeeEmail={canSeeEmail}
        canAddMember={canAddMember}
        onAddMember={() => setModalOpened(true)}
        note={WORKSPACE_ADMINS_NOTE}
        roleHint={(m) => (m.roleLimited ? ROLE_LIMITED_TOOLTIP : null)}
        emptyState={emptyState}
      />
      {canAddMember && (
        <AddProjectMembersModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          slug={workspace.slug}
          identifier={project.identifier}
          addableRoles={query.data?.addableRoles ?? []}
          canSeeEmail={canSeeEmail}
        />
      )}
    </>
  );
}
