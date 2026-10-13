import { useState } from 'react';
import { Text } from '@mantine/core';
import {
  MEMBER_CANDIDATE_QUERY_MIN,
  MEMBER_MESSAGES,
  looksLikeFullEmail,
  type ProjectMemberCandidate,
} from '@repo/contracts';
import { MemberCandidateCombobox } from '../../../members/MemberCandidateCombobox';
import { useMemberCandidateSearch } from '../../../members/useMemberCandidateSearch';
import { projectMembersApi } from '../../api/projectMembersApi';
import { projectKeys } from '../../api/projectQueries';
import {
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
  selectedUserIds?: readonly string[];
  error?: string | null;
  disabled?: boolean;
}

export function ProjectMemberCandidateSelect({
  slug,
  identifier,
  value,
  onChange,
  canSeeEmail,
  selectedUserIds = [],
  error,
  disabled = false,
}: ProjectMemberCandidateSelectProps) {
  const [search, setSearch] = useState('');

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
      emptyContent={<Text size="sm">{NO_WORKSPACE_MEMBER_FOUND}</Text>}
      selectedUserIds={selectedUserIds}
      error={error}
      disabled={disabled}
    />
  );
}
