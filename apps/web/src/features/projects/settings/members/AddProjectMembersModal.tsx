import { useMemo } from 'react';
import {
  DEFAULT_ADDED_PROJECT_ROLE,
  PROJECT_ROLE_LABELS,
  type ProjectMemberCandidate,
  type ProjectRole,
} from '@repo/contracts';
import {
  AddMembersModalFrame,
  type SubmitOutcome,
} from '../../../members/AddMembersModalFrame';
import {
  highestRole,
  isTopRole,
  PROJECT_ROLE_SCHEME,
} from '../../../members/roleScheme';
import { ProjectMemberCandidateSelect } from './ProjectMemberCandidateSelect';
import {
  ADD_PROJECT_MEMBERS_DESCRIPTION,
  limitedToRoleMessage,
  PROJECT_ADMIN_NOTICE,
} from './projectMembersMessages';

export interface AddProjectMembersModalProps {
  opened: boolean;
  onClose: () => void;
  slug: string;
  identifier: string;
  addableRoles: ProjectRole[];
  canSeeEmail: boolean;
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
  onSubmit,
}: AddProjectMembersModalProps) {
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
      highest: (roles: readonly ProjectRole[]) =>
        highestRole(PROJECT_ROLE_SCHEME, roles),
      limitedNotice: (r: ProjectRole) =>
        limitedToRoleMessage(PROJECT_ROLE_LABELS[r]),
    }),
    [defaultRole],
  );

  const handleSubmit = useMemo(() => {
    if (onSubmit) return onSubmit;
    return async (): Promise<SubmitOutcome> => ({ kind: 'done' });
  }, [onSubmit]);

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
          selectedUserIds={otherSelectedIds}
          error={row.error}
        />
      )}
      notice={(row) =>
        isTopRole(PROJECT_ROLE_SCHEME, row.role) ? PROJECT_ADMIN_NOTICE : null
      }
      onSubmit={handleSubmit}
    />
  );
}
