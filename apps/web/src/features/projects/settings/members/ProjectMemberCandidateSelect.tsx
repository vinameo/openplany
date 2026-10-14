import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Anchor, Text } from '@mantine/core';
import {
  MEMBER_CANDIDATE_QUERY_MIN,
  looksLikeFullEmail,
  type ProjectMemberCandidate,
} from '@repo/contracts';
import { MemberCandidateCombobox } from '../../../members/MemberCandidateCombobox';
import { useMemberCandidateSearch } from '../../../members/useMemberCandidateSearch';
import { CurrentWorkspaceContext } from '../../../workspaces/currentWorkspace/currentWorkspaceContext';
import { workspaceSettingsPath } from '../../../workspaces/workspacePaths';
import { projectMembersApi } from '../../api/projectMembersApi';
import { projectKeys } from '../../api/projectQueries';

export interface ProjectMemberCandidateSelectProps {
  slug: string;
  identifier: string;
  value: ProjectMemberCandidate | null;
  onChange: (candidate: ProjectMemberCandidate | null) => void;
  canSeeEmail: boolean;
  canAddWorkspaceMember?: boolean;
  selectedUserIds?: readonly string[];
  error?: string | null;
  errorId?: string;
  disabled?: boolean;
}

export function ProjectMemberCandidateSelect({
  slug,
  identifier,
  value,
  onChange,
  canSeeEmail,
  canAddWorkspaceMember,
  selectedUserIds = [],
  error,
  errorId,
  disabled = false,
}: ProjectMemberCandidateSelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const currentWorkspace = useContext(CurrentWorkspaceContext);

  const canAddWorkspace =
    canAddWorkspaceMember ??
    Boolean(
      currentWorkspace?.workspace?.permissions?.includes('workspace.members.add'),
    );

  const isReady = (trimmed: string) =>
    canSeeEmail
      ? trimmed.length >= MEMBER_CANDIDATE_QUERY_MIN
      : looksLikeFullEmail(trimmed);

  const notReadyHint = canSeeEmail
    ? t('members:errors.candidateQueryTooShort')
    : t('project:members.typeFullEmail');

  const candidateState = useMemberCandidateSearch<ProjectMemberCandidate>({
    queryKey: (q) => projectKeys.memberCandidates(slug, identifier, q),
    fetcher: (q, signal) =>
      projectMembersApi.searchCandidates(slug, identifier, q, signal),
    query: search,
    isReady,
    notReadyHint,
  });

  const emptyContent = (
    <Text size="sm">
      {t('project:members.noWorkspaceMemberFound')}
      {canAddWorkspace && (
        <>
          {' '}
          <Anchor
            href={workspaceSettingsPath(slug, 'members')}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {t('project:members.addToWorkspaceLink')}
          </Anchor>
        </>
      )}
    </Text>
  );

  return (
    <MemberCandidateCombobox
      value={value}
      onChange={onChange}
      search={search}
      onSearchChange={setSearch}
      state={candidateState}
      disabledLabel={(c) => {
        if (c.status === 'already_member') {
          return t('project:members.alreadyInProject');
        }
        if (c.status === 'workspace_admin') {
          return t('project:members.workspaceAdminCandidate');
        }
        return null;
      }}
      emptyContent={emptyContent}
      selectedUserIds={selectedUserIds}
      error={error}
      errorId={errorId}
      disabled={disabled}
    />
  );
}
