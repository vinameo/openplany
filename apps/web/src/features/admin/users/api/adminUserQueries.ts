import type { QueryClient } from '@tanstack/react-query';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { AdminUserListResponse, AdminUserResponse } from '@repo/contracts';
import type { UsersListParams } from '../usersListParams';
import { adminUsersApi } from './adminUsersApi';

export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  lists: () => [...adminUserKeys.all, 'list'] as const,
  list: (params: UsersListParams) =>
    [...adminUserKeys.lists(), params] as const,
  detail: (id: string) => [...adminUserKeys.all, 'detail', id] as const,
};

export function adminUsersListQuery(params: UsersListParams) {
  return queryOptions({
    queryKey: adminUserKeys.list(params),
    queryFn: () => adminUsersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export const adminUserQueries = {
  list: adminUsersListQuery,
};

export function invalidateAdminUserLists(
  queryClient: QueryClient,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: adminUserKeys.lists(),
  });
}

export function replaceAdminUserInCache(
  queryClient: QueryClient,
  user: AdminUserResponse,
): void {
  queryClient.setQueriesData<AdminUserListResponse>(
    { queryKey: adminUserKeys.lists() },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((item) => (item.id === user.id ? user : item)),
      };
    },
  );
  queryClient.setQueryData(adminUserKeys.detail(user.id), user);
}
