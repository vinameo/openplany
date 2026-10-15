import type {
  AdminUserListResponse,
  CreatedUserResponse,
  CreateUserRequest,
  MessageKey,
} from '@repo/contracts';
import { request } from '../../../../lib/apiClient';
import type { UsersListParams } from '../usersListParams';

export const GENERIC_CREATE_USER_ERROR_KEY: MessageKey =
  'admin:users.errors.createFailed';
export const GENERIC_LOAD_USERS_ERROR_KEY: MessageKey =
  'admin:users.errors.loadFailed';

export const adminUsersApi = {
  createUser(body: CreateUserRequest): Promise<CreatedUserResponse> {
    return request<CreatedUserResponse>(
      '/api/admin/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      GENERIC_CREATE_USER_ERROR_KEY,
    );
  },

  list(params: UsersListParams): Promise<AdminUserListResponse> {
    const query = new URLSearchParams();
    query.set('page', String(params.page));
    query.set('sort', params.sort);
    query.set('order', params.order);
    if (params.search) {
      query.set('search', params.search);
    }
    if (params.status && params.status !== 'all') {
      query.set('status', params.status);
    }
    if (params.admin === 'only') {
      query.set('instanceAdmin', 'only');
    }

    return request<AdminUserListResponse>(
      `/api/admin/users?${query.toString()}`,
      { method: 'GET' },
      GENERIC_LOAD_USERS_ERROR_KEY,
    );
  },
};
