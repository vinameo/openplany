import { useMemo } from "react";
import { Text } from "@mantine/core";
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
import {
  NO_MEMBERS_YET,
  ROLE_LIMITED_TOOLTIP,
  WORKSPACE_ADMINS_NOTE,
} from "./projectMembersMessages";
import { useProjectMembers } from "./useProjectMembers";

export function ProjectMembersSettingsPage() {
  const { project } = useCurrentProject();
  const { workspace } = useCurrentWorkspace();

  const query = useProjectMembers(
    workspace.slug,
    project?.identifier ?? "",
  );

  const canSeeEmail = workspace.permissions.includes(
    "workspace.members.email.view",
  );
  // Tracer bullet in Ticket 06: canAddMember = false (enabled in Ticket 08)
  const canAddMember = false;

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

  return (
    <MembersListView
      scheme={PROJECT_ROLE_SCHEME}
      state={listViewState}
      canSeeEmail={canSeeEmail}
      canAddMember={canAddMember}
      onAddMember={() => {}}
      note={WORKSPACE_ADMINS_NOTE}
      roleHint={(m) => (m.roleLimited ? ROLE_LIMITED_TOOLTIP : null)}
      emptyState={<Text c="dimmed">{NO_MEMBERS_YET}</Text>}
    />
  );
}
