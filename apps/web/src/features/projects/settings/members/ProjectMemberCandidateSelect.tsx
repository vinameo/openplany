import { useContext, useState } from 'react';
import { Anchor, Text } from '@mantine/core';
import {
  MEMBER_CANDIDATE_QUERY_MIN,
  MEMBER_MESSAGES,
  looksLikeFullEmail,
  type ProjectMemberCandidate,
} from '@repo/contracts';
import { MemberCandidateCombobox } from '../../../members/MemberCandidateCombobox';
import { useMemberCandidateSearch } from '../../../members/useMemberCandidateSearch';
import { CurrentWorkspaceContext } from '../../../workspaces/currentWorkspace/currentWorkspaceContext';
import { workspaceSettingsPath } from '../../../workspaces/workspacePaths';
import { projectMembersApi } from '../../api/projectMembersApi';
import { projectKeys } from '../../api/projectQueries';
import {
  ADD_TO_WORKSPACE_LINK,
  ALREADY_IN_PROJECT_LABEL,
  NO_WORKSPACE_MEMBER_FOUND,
  TYPE_FULL_EMAIL,
  WORKSPACE_ADMIN_CANDIDATE_LABEL,
} from './projectMembersMessages';

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
    ? MEMBER_MESSAGES.candidateQueryTooShort
    : TYPE_FULL_EMAIL;

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
      {NO_WORKSPACE_MEMBER_FOUND}
      {canAddWorkspace && (
        <>
          {' '}
          <Anchor
            href={workspaceSettingsPath(slug, 'members')}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {ADD_TO_WORKSPACE_LINK}
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
          return ALREADY_IN_PROJECT_LABEL;
        }
        if (c.status === 'workspace_admin') {
          return WORKSPACE_ADMIN_CANDIDATE_LABEL;
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
