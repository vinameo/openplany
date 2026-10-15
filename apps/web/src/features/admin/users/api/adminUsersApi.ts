import type {
  AdminUserListResponse,
  AdminUserResponse,
  CreatedUserResponse,
  CreateUserRequest,
  MessageKey,
  UpdateAdminUserRequest,
} from '@repo/contracts';
import { request } from '../../../../lib/apiClient';
import type { UsersListParams } from '../usersListParams';

export const GENERIC_CREATE_USER_ERROR_KEY: MessageKey =
  'admin:users.errors.createFailed';
export const GENERIC_LOAD_USERS_ERROR_KEY: MessageKey =
  'admin:users.errors.loadFailed';
export const GENERIC_LOAD_USER_ERROR_KEY: MessageKey =
  'admin:users.errors.loadUserFailed';
export const GENERIC_UPDATE_USER_ERROR_KEY: MessageKey =
  'admin:users.errors.updateFailed';

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

  get(userId: string): Promise<AdminUserResponse> {
    return request<AdminUserResponse>(
      `/api/admin/users/${userId}`,
      { method: 'GET' },
      GENERIC_LOAD_USER_ERROR_KEY,
    );
  },

  update(
    userId: string,
    body: UpdateAdminUserRequest,
  ): Promise<AdminUserResponse> {
    return request<AdminUserResponse>(
      `/api/admin/users/${userId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      GENERIC_UPDATE_USER_ERROR_KEY,
    );
  },
};
