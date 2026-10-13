import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Badge, Button, Stack, Text, Tooltip } from "@mantine/core";
import { useMutationState } from "@tanstack/react-query";
import {
  PROJECT_MEMBER_LIST_MAX,
  PROJECT_ROLE_SUMMARIES,
  projectRoleChangeKind,
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
import { memberDisplayName } from "../../../members/memberListView";
import { RoleSelectCell } from "../../../members/RoleSelectCell";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useCurrentProject } from "../../detail/currentProjectContext";
import { projectMemberMutationKeys } from "../../api/projectQueries";
import { AddProjectMembersModal } from "./AddProjectMembersModal";
import {
  inheritedRoleTooltip,
  NO_MEMBERS_YET,
  ROLE_LIMITED_TOOLTIP,
} from "./projectMembersMessages";
import { useChangeProjectRole } from "./useChangeProjectRole";
import { useProjectMembers } from "./useProjectMembers";

export function ProjectMembersSettingsPage() {
  const { project } = useCurrentProject();
  const { workspace } = useCurrentWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const selectRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const handleFocusRestore = useCallback((userId: string) => {
    requestAnimationFrame(() => {
      const el = selectRefs.current.get(userId);
      if (el && document.contains(el)) {
        el.focus();
      } else {
        const filtersBtn = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Filter by role"]',
        );
        filtersBtn?.focus();
      }
    });
  }, []);

  const changeRoleMutation = useChangeProjectRole({
    slug: workspace.slug,
    identifier: project?.identifier ?? "",
    projectName: project?.name ?? "",
    onSettledFocus: handleFocusRestore,
  });

  const pendingUserIds = useMutationState({
    filters: {
      mutationKey: projectMemberMutationKeys.all(
        workspace.slug,
        project?.identifier ?? "",
      ),
      status: "pending",
    },
    select: (mutation) => {
      const key = mutation.options.mutationKey;
      return key ? (key[key.length - 1] as string) : null;
    },
  });

  const savingUserIds = useMemo(
    () => new Set(pendingUserIds.filter((id): id is string => Boolean(id))),
    [pendingUserIds],
  );

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
        roleControl={(m, roleHint) => {
          if (
            m.source === "inherited" ||
            !m.assignableRoles ||
            m.assignableRoles.length <= 1
          ) {
            return null;
          }
          // Ticket 02: Only "other" role change kinds. Filter out options that would be gain_admin or lose_admin.
          const allowedOptions = m.assignableRoles.filter(
            (r) => projectRoleChangeKind(m.role, r) === "other",
          );
          if (allowedOptions.length <= 1) {
            return null;
          }
          return (
            <RoleSelectCell
              ref={(el) => {
                if (el) selectRefs.current.set(m.userId, el);
                else selectRefs.current.delete(m.userId);
              }}
              value={m.role}
              options={allowedOptions}
              labels={PROJECT_ROLE_SCHEME.labels}
              descriptions={PROJECT_ROLE_SUMMARIES}
              description={roleHint}
              memberName={memberDisplayName(m)}
              disabled={savingUserIds.has(m.userId)}
              onRequestChange={(next) => {
                changeRoleMutation.mutate({
                  userId: m.userId,
                  body: { fromRole: m.role, role: next },
                  memberName: memberDisplayName(m),
                });
              }}
            />
          );
        }}
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
