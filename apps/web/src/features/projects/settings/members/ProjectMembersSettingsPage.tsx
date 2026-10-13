import { useId, useMemo, useState } from "react";
import { Badge, Button, Stack, Text, Tooltip } from "@mantine/core";
import {
  PROJECT_MEMBER_LIST_MAX,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  type ProjectMemberResponse,
  type ProjectRole,
  type WorkspaceRole,
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
  inheritedRoleTooltip,
  NO_MEMBERS_YET,
  ROLE_LIMITED_TOOLTIP,
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
        roleHint={(m) => (m.roleLimited ? ROLE_LIMITED_TOOLTIP : null)}
        roleBadge={(m) =>
          m.source === 'inherited' ? (
            <InheritedRoleBadge
              workspaceRole={m.workspaceRole}
              implicitRole={m.role}
            />
          ) : null
        }
        isReadOnly={(m) => m.source === 'inherited'}
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
          canAddWorkspaceMember={workspace.permissions.includes(
            'workspace.members.add',
          )}
        />
      )}
    </>
  );
}

export function InheritedRoleBadge({
  workspaceRole,
  implicitRole,
}: {
  workspaceRole: WorkspaceRole;
  implicitRole: ProjectRole;
}) {
  const tooltipText = inheritedRoleTooltip(workspaceRole, implicitRole);
  const label = WORKSPACE_ROLE_QUALIFIED_LABELS[workspaceRole];
  const tooltipId = useId();

  return (
    <Tooltip
      id={tooltipId}
      label={tooltipText}
      withArrow
      multiline
      events={{ hover: true, focus: true, touch: true }}
    >
      <Badge
        color="gray"
        variant="light"
        size="xs"
        tabIndex={0}
        aria-describedby={tooltipId}
        style={{ cursor: 'default' }}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
