import { useContext, useMemo } from 'react';
import {
  DEFAULT_ADDED_PROJECT_ROLE,
  PROJECT_ROLE_LABELS,
  type ProjectMemberCandidate,
  type ProjectRole,
} from '@repo/contracts';
import { CurrentProjectContext } from '../../detail/currentProjectContext';
import {
  AddMembersModalFrame,
  type SubmitOutcome,
} from '../../../members/AddMembersModalFrame';
import {
  highestRole,
  isTopRole,
  PROJECT_ROLE_SCHEME,
} from '../../../members/roleScheme';
import { submitAddMembers } from '../../../members/submitAddMembers';
import { ProjectMemberCandidateSelect } from './ProjectMemberCandidateSelect';
import {
  ADD_PROJECT_MEMBERS_DESCRIPTION,
  limitedToRoleMessage,
  PROJECT_ADMIN_NOTICE,
  roleRaisedHint,
} from './projectMembersMessages';
import { useAddProjectMembers } from './useAddProjectMembers';

export interface AddProjectMembersModalProps {
  opened: boolean;
  onClose: () => void;
  slug: string;
  identifier: string;
  addableRoles: ProjectRole[];
  canSeeEmail: boolean;
  canAddWorkspaceMember?: boolean;
  onSubmit?: (
    body: { members: { userId: string; role: ProjectRole }[] },
    rowIdByIndex: readonly string[],
  ) => Promise<SubmitOutcome>;
}

export function AddProjectMembersModal({
  opened,
  onClose,
  slug,
  identifier,
  addableRoles,
  canSeeEmail,
  canAddWorkspaceMember,
  onSubmit,
}: AddProjectMembersModalProps) {
  const currentProject = useContext(CurrentProjectContext);
  const addMutation = useAddProjectMembers(slug, identifier);

  const defaultRole: ProjectRole = useMemo(() => {
    if (addableRoles.includes(DEFAULT_ADDED_PROJECT_ROLE)) {
      return DEFAULT_ADDED_PROJECT_ROLE;
    }
    return (
      highestRole(PROJECT_ROLE_SCHEME, addableRoles) ??
      DEFAULT_ADDED_PROJECT_ROLE
    );
  }, [addableRoles]);

  const rowsContext = useMemo(
    () => ({
      defaultRole,
      rolesFor: (c: ProjectMemberCandidate) => c.addableRoles,
      rank: PROJECT_ROLE_SCHEME.rank,
      highest: (roles: readonly ProjectRole[]) =>
        highestRole(PROJECT_ROLE_SCHEME, roles),
      roleNotice: ({
        role,
        reason,
        candidate,
      }: {
        role: ProjectRole;
        reason: 'lowered' | 'raised';
        candidate: ProjectMemberCandidate;
      }) => {
        if (reason === 'lowered') {
          return limitedToRoleMessage(PROJECT_ROLE_LABELS[role]);
        }
        return roleRaisedHint(candidate.workspaceRole ?? 'member', role);
      },
      limitedNotice: (r: ProjectRole) =>
        limitedToRoleMessage(PROJECT_ROLE_LABELS[r]),
    }),
    [defaultRole],
  );

  const handleSubmit = useMemo(() => {
    if (onSubmit) return onSubmit;
    return (
      body: { members: { userId: string; role: ProjectRole }[] },
      rowIdByIndex: readonly string[],
    ): Promise<SubmitOutcome> =>
      submitAddMembers({
        send: () => addMutation.mutateAsync(body),
        rowIdByIndex,
        refreshAfterLostAccess: () => currentProject?.reload(),
        logContext: 'project.members.add',
      });
  }, [onSubmit, addMutation, currentProject]);

  return (
    <AddMembersModalFrame<ProjectRole, ProjectMemberCandidate>
      opened={opened}
      onClose={onClose}
      title="Add member"
      description={ADD_PROJECT_MEMBERS_DESCRIPTION}
      scheme={PROJECT_ROLE_SCHEME}
      defaultRole={defaultRole}
      rowsContext={rowsContext}
      roleOptionsFor={(row) =>
        row.candidate ? row.candidate.addableRoles : addableRoles
      }
      renderCandidate={(row, otherSelectedIds, onSelect) => (
        <ProjectMemberCandidateSelect
          slug={slug}
          identifier={identifier}
          value={row.candidate}
          onChange={onSelect}
          canSeeEmail={canSeeEmail}
          canAddWorkspaceMember={canAddWorkspaceMember}
          selectedUserIds={otherSelectedIds}
          error={row.error}
          errorId={row.error ? `candidate-error-${row.id}` : undefined}
        />
      )}
      notice={(row) =>
        isTopRole(PROJECT_ROLE_SCHEME, row.role) ? PROJECT_ADMIN_NOTICE : null
      }
      onSubmit={handleSubmit}
    />
  );
}
