import { useContext, useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import {
  DEFAULT_ADDED_PROJECT_ROLE,
  MEMBER_MESSAGES,
  PROJECT_ROLE_LABELS,
  type ProjectMemberCandidate,
  type ProjectRole,
} from '@repo/contracts';
import { ApiRequestError } from '../../../../lib/apiClient';
import { CurrentProjectContext } from '../../detail/currentProjectContext';
import {
  AddMembersModalFrame,
  type SubmitOutcome,
} from '../../../members/AddMembersModalFrame';
import { mapFieldErrors } from '../../../members/addMembersRows';
import {
  addedMembersMessage,
  SOMETHING_WENT_WRONG,
  tooManyAttemptsMessage,
} from '../../../members/membersMessages';
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
      highest: (roles: readonly ProjectRole[]) =>
        highestRole(PROJECT_ROLE_SCHEME, roles),
      limitedNotice: (r: ProjectRole) =>
        limitedToRoleMessage(PROJECT_ROLE_LABELS[r]),
    }),
    [defaultRole],
  );

  const handleSubmit = useMemo(() => {
    if (onSubmit) return onSubmit;
    return async (
      body: { members: { userId: string; role: ProjectRole }[] },
      rowIdByIndex: readonly string[],
    ): Promise<SubmitOutcome> => {
      try {
        const res = await addMutation.mutateAsync(body);
        const count = res.members.length;
        notifications.show({
          message: addedMembersMessage(count),
        });
        return { kind: 'done' };
      } catch (err: unknown) {
        if (err instanceof ApiRequestError) {
          if (err.status === 403) {
            const forbiddenMessage =
              err.message === MEMBER_MESSAGES.roleNotAllowed
                ? MEMBER_MESSAGES.roleNotAllowed
                : MEMBER_MESSAGES.notAllowed;
            notifications.show({
              color: 'red',
              message: forbiddenMessage,
            });
            await currentProject?.reload?.();
            return { kind: 'done' };
          }

          if (err.status === 404) {
            await currentProject?.reload?.();
            return { kind: 'done' };
          }

          if (err.status === 429) {
            return {
              kind: 'alert',
              message: tooManyAttemptsMessage(err.retryAfterSeconds ?? null),
            };
          }

          if (err.status === 409 || err.status === 400) {
            if (err.fields && Object.keys(err.fields).length > 0) {
              const rowErrors = mapFieldErrors(err.fields, rowIdByIndex);
              if (Object.keys(rowErrors).length > 0) {
                return { kind: 'rowErrors', byRowId: rowErrors };
              }
            }
            return {
              kind: 'alert',
              message: MEMBER_MESSAGES.checkFields,
            };
          }
        }

        return {
          kind: 'alert',
          message: SOMETHING_WENT_WRONG,
        };
      }
    };
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
