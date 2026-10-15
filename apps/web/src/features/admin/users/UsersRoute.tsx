import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Skeleton } from '@mantine/core';
import { Navigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ADMIN_USERS_PAGE_SIZE } from '@repo/contracts';
import { useAuth } from '../../auth/useAuth';
import { authApi } from '../../auth/api/authApi';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { AdminPageLayout } from '../AdminPageLayout';
import {
  parseUsersListParams,
  toUsersSearchParams,
  type UsersListParams,
} from './usersListParams';
import { adminUserQueries } from './api/adminUserQueries';
import { parseAdminUserError } from './adminUserErrors';
import { UsersToolbar } from './UsersToolbar';
import { UsersTable } from './UsersTable';
import { UsersPagination } from './UsersPagination';
import { CreateUserModal } from './CreateUserModal';
import classes from './UsersRoute.module.css';

export function UsersRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t('admin:users.documentTitle'));
  const { state: authState, updateUser, expireSession } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createModalOpened, setCreateModalOpened] = useState(false);

  const params = useMemo(() => parseUsersListParams(searchParams), [searchParams]);

  const updateParams = useCallback(
    (newParams: UsersListParams) => {
      setSearchParams(toUsersSearchParams(newParams), { replace: true });
    },
    [setSearchParams],
  );

  const { data, isPlaceholderData, error } = useQuery(
    adminUserQueries.list(params),
  );

  // Re-verify session when 403 occurs while viewing the page (B2.1, B2.7)
  useEffect(() => {
    if (error) {
      const action = parseAdminUserError(error, 'list');
      if (action.type === 'expireSession') {
        expireSession();
      } else if (action.type === 'forbidden' && action.refreshSession) {
        authApi
          .getSession()
          .then((session) => {
            if (session !== null) {
              updateUser(session.user);
            } else {
              expireSession();
            }
          })
          .catch(() => {});
      }
    }
  }, [error, expireSession, updateUser]);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / ADMIN_USERS_PAGE_SIZE);

  // Clamp to last valid page if page exceeds totalPages (B2.2)
  useEffect(() => {
    if (!isPlaceholderData && total > 0 && params.page > totalPages) {
      updateParams({ ...params, page: totalPages });
    }
  }, [isPlaceholderData, total, totalPages, params, updateParams]);

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

  return (
    <AdminPageLayout
      title={t('admin:users.page.title')}
      badge={badge}
      maxWidth={1200}
    >
      <div className={classes.container}>
        <UsersToolbar
          search={params.search}
          onSearchChange={(search) =>
            updateParams({ ...params, search, page: 1 })
          }
          onAddUser={() => setCreateModalOpened(true)}
        />

        <UsersTable
          users={data?.items ?? []}
          currentSort={{ key: params.sort, direction: params.order }}
          onSortChange={(sort) =>
            updateParams({
              ...params,
              sort: sort.key,
              order: sort.direction,
              page: 1,
            })
          }
          isPlaceholderData={isPlaceholderData}
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
    </AdminPageLayout>
  );
}
