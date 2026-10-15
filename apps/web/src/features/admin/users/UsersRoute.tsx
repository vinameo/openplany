import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Skeleton, Text } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ADMIN_USERS_PAGE_SIZE,
  type AdminUserResponse,
  type AdminUserSortKey,
} from '@repo/contracts';
import { useAuth } from '../../auth/useAuth';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import type { SortState } from '../../workspaces/table/SortableHeader';
import { AdminPageLayout } from '../AdminPageLayout';
import {
  parseUsersListParams,
  toUsersSearchParams,
  type UsersListParams,
} from './usersListParams';
import { adminUserQueries } from './api/adminUserQueries';
import { parseAdminUserError } from './adminUserErrors';
import { useAdminUserErrorRecovery } from './useAdminUserErrorRecovery';
import { UsersToolbar } from './UsersToolbar';
import { UsersTable } from './UsersTable';
import { UsersPagination } from './UsersPagination';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import classes from './UsersRoute.module.css';

export function UsersRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin:users.documentTitle'));
  const { state: authState } = useAuth();
  const { expireSession, refreshSessionAfterForbidden } =
    useAdminUserErrorRecovery();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserResponse | null>(null);
  const [changingPasswordUser, setChangingPasswordUser] = useState<AdminUserResponse | null>(null);

  const params = useMemo(() => parseUsersListParams(searchParams), [searchParams]);

  const updateParams = useCallback(
    (newParams: UsersListParams) => {
      setSearchParams(toUsersSearchParams(newParams), { replace: true });
    },
    [setSearchParams],
  );

  const { data, isPlaceholderData, error, refetch } = useQuery(
    adminUserQueries.list(params),
  );

  const queryErrorAction = useMemo(() => {
    if (!error) return null;
    return parseAdminUserError(error, 'list');
  }, [error]);

  // Re-verify session when 403 occurs while viewing the page (B2.1, B2.7)
  useEffect(() => {
    if (queryErrorAction?.type === 'expireSession') {
      expireSession();
    } else if (queryErrorAction?.type === 'forbidden') {
      void refreshSessionAfterForbidden();
    }
  }, [queryErrorAction, expireSession, refreshSessionAfterForbidden]);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / ADMIN_USERS_PAGE_SIZE);

  // Clamp to last valid page if page exceeds totalPages (B2.2)
  useEffect(() => {
    if (!isPlaceholderData && total > 0 && params.page > totalPages) {
      updateParams({ ...params, page: totalPages });
    }
  }, [isPlaceholderData, total, totalPages, params, updateParams]);

  const handleSearchChange = useCallback(
    (search: string) => {
      updateParams({ ...params, search, page: 1 });
    },
    [params, updateParams],
  );

  const handleFilterChange = useCallback(
    (filters: { status: typeof params.status; admin?: 'only' }) => {
      updateParams({
        ...params,
        status: filters.status,
        admin: filters.admin,
        page: 1,
      });
    },
    [params, updateParams],
  );

  const handleClearFilters = useCallback(() => {
    updateParams({
      ...params,
      status: 'all',
      admin: undefined,
      page: 1,
    });
  }, [params, updateParams]);

  const handleClearAll = useCallback(() => {
    updateParams({
      ...params,
      search: '',
      status: 'all',
      admin: undefined,
      page: 1,
    });
  }, [params, updateParams]);

  const handleSortChange = useCallback(
    (sort: SortState<AdminUserSortKey>) => {
      updateParams({
        ...params,
        sort: sort.key,
        order: sort.direction,
        page: 1,
      });
    },
    [params, updateParams],
  );

  if (
    authState.status === 'authenticated' &&
    !authState.session.user.isInstanceAdmin
  ) {
    return <Navigate to="/" replace />;
  }

  if (authState.status === 'loading') {
    return (
      <AdminPageLayout maxWidth={1200}>
        <div className={classes.skeletonGroup}>
          <Skeleton height={36} width={200} mb="md" />
          <Skeleton height={400} />
        </div>
      </AdminPageLayout>
    );
  }

  const badge = (
    <Badge
      variant="light"
      color="gray"
      size="sm"
      aria-label={t('admin:users.page.usersCount', { count: total })}
      className={classes.countBadge}
    >
      {total}
    </Badge>
  );

  const hasFiltersOrSearch = Boolean(
    params.search || (params.status && params.status !== 'all') || params.admin === 'only',
  );

  return (
    <AdminPageLayout
      title={t('admin:users.page.title')}
      badge={badge}
      maxWidth={1200}
    >
      <div className={classes.container}>
        <UsersToolbar
          search={params.search}
          onSearchChange={handleSearchChange}
          status={params.status}
          admin={params.admin}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          onAddUser={() => setCreateModalOpened(true)}
        />

        {error && (
          <Alert color="red" mb="md" data-testid="users-load-error">
            <Text size="sm" mb="xs">
              {queryErrorAction?.type === 'rateLimit'
                ? queryErrorAction.message
                : t('admin:users.errors.loadFailed')}
            </Text>
            <Button variant="default" size="xs" onClick={() => refetch()}>
              {t('common:actions.tryAgain')}
            </Button>
          </Alert>
        )}

        <UsersTable
          users={data?.items ?? []}
          currentUserId={
            authState.status === 'authenticated'
              ? authState.session.user.id
              : undefined
          }
          currentSort={{ key: params.sort, direction: params.order }}
          onSortChange={handleSortChange}
          isPlaceholderData={isPlaceholderData}
          onClearFilters={hasFiltersOrSearch ? handleClearAll : undefined}
          onEdit={(user) => setEditingUser(user)}
          onChangePassword={(user) => setChangingPasswordUser(user)}
        />

        <UsersPagination
          page={params.page}
          total={total}
          onPageChange={(page) => updateParams({ ...params, page })}
        />
      </div>

      <CreateUserModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        onCreated={() => setCreateModalOpened(false)}
      />

      <EditUserModal
        opened={editingUser !== null}
        user={editingUser}
        onClose={() => setEditingUser(null)}
      />

      <ChangePasswordModal
        opened={changingPasswordUser !== null}
        user={changingPasswordUser}
        onClose={() => setChangingPasswordUser(null)}
      />
    </AdminPageLayout>
  );
}
