import { type ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { truncatedMembersMessage } from '@repo/contracts';
import {
  COULDNT_LOAD_MEMBERS,
  TRY_AGAIN,
  NO_MEMBERS_MATCH,
  CLEAR_SEARCH_AND_FILTERS,
} from './membersMessages';
import {
  applyMemberListQuery,
  DEFAULT_MEMBER_SORT,
  type MemberRowView,
  type MemberSort,
} from './memberListView';
import { MembersTable } from './MembersTable';
import { MembersToolbar } from './MembersToolbar';
import type { RoleScheme } from './roleScheme';

export type MembersListState<M> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      members: readonly M[];
      total: number;
      truncated: boolean;
      listMax: number;
    };

export interface MembersListViewProps<
  R extends string,
  M extends MemberRowView<R>,
> {
  scheme: RoleScheme<R>;
  state: MembersListState<M>;
  canSeeEmail: boolean;
  canAddMember: boolean;
  onAddMember: () => void;
  title?: string;
  note?: ReactNode;
  alerts?: ReactNode;
  roleHint?: (m: M) => string | null;
  emptyState?: ReactNode;
}

export function MembersListView<
  R extends string,
  M extends MemberRowView<R>,
>({
  scheme,
  state,
  canSeeEmail,
  canAddMember,
  onAddMember,
  title = 'Members',
  note,
  alerts,
  roleHint,
  emptyState,
}: MembersListViewProps<R, M>) {
  const [search, setSearch] = useState('');
  const [roles, setRoles] = useState<R[]>([]);
  const [sort, setSort] = useState<MemberSort>(DEFAULT_MEMBER_SORT);

  const clearSearchAndFilters = () => {
    setSearch('');
    setRoles([]);
  };

  const rawMembers = state.status === 'ready' ? state.members : undefined;
  const filteredMembers = useMemo(
    () =>
      applyMemberListQuery(
        rawMembers ?? [],
        { search, roles, sort },
        { canSeeEmail, scheme },
      ),
    [rawMembers, search, roles, sort, canSeeEmail, scheme],
  );

  if (state.status === 'loading') {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Skeleton height={28} width={120} />
          <Skeleton height={20} width={40} radius="xl" />
        </Group>
        <Stack gap="xs">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </Stack>
      </Stack>
    );
  }

  if (state.status === 'error') {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Title order={2}>{title}</Title>
        </Group>
        <Alert color="red" role="alert">
          <Group justify="space-between" align="center">
            <Text size="sm">{COULDNT_LOAD_MEMBERS}</Text>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={state.retry}
            >
              {TRY_AGAIN}
            </Button>
          </Group>
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <Title order={2}>{title}</Title>
        <Badge variant="light" color="gray" size="sm">
          {state.total}
        </Badge>
      </Group>

      {note}

      {state.truncated && (
        <Alert color="yellow" role="alert">
          {truncatedMembersMessage(state.listMax, state.total)}
        </Alert>
      )}

      {alerts}

      {state.total === 0 && emptyState ? (
        emptyState
      ) : (
        <>
          <MembersToolbar
            scheme={scheme}
            search={search}
            onSearchChange={setSearch}
            selectedRoles={roles}
            onRolesChange={setRoles}
            canAddMember={canAddMember}
            onAddMember={onAddMember}
          />

          {filteredMembers.length === 0 ? (
            <Stack align="center" gap="xs" py="xl">
              <Text size="sm" c="dimmed">
                {NO_MEMBERS_MATCH}
              </Text>
              <Button
                variant="subtle"
                size="sm"
                onClick={clearSearchAndFilters}
              >
                {CLEAR_SEARCH_AND_FILTERS}
              </Button>
            </Stack>
          ) : (
            <MembersTable
              members={filteredMembers}
              scheme={scheme}
              canSeeEmail={canSeeEmail}
              currentSort={sort}
              onSortChange={setSort}
              roleHint={roleHint}
            />
          )}
        </>
      )}
    </Stack>
  );
}
