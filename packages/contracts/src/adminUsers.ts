export const ADMIN_USERS_PAGE_SIZE = 50;
export const ADMIN_USER_SEARCH_MAX = 100; // characters, after normalization
export const ADMIN_USER_SEARCH_TERMS_MAX = 5;
export const ADMIN_USER_PAGE_MAX = 10_000;

export const ADMIN_USER_SORT_KEYS = [
  "createdAt",
  "fullName",
  "displayName",
  "email",
] as const;
export type AdminUserSortKey = (typeof ADMIN_USER_SORT_KEYS)[number];

export type SortOrder = "asc" | "desc";

/**
 * Single source of truth: createdAt -> 'desc', any other column -> 'asc' (INV-03).
 */
export function defaultAdminUserOrder(sort: AdminUserSortKey): SortOrder {
  return sort === "createdAt" ? "desc" : "asc";
}

export const ADMIN_USER_STATUSES = ["all", "active", "deactivated"] as const;
export type AdminUserStatusFilter = (typeof ADMIN_USER_STATUSES)[number];

export interface AdminUserListQuery {
  search?: string;
  status?: AdminUserStatusFilter; // defaults to 'all'
  instanceAdmin?: "only"; // absent = everyone
  sort?: AdminUserSortKey; // defaults to 'createdAt'
  order?: SortOrder; // defaults to defaultAdminUserOrder(sort)
  page?: number; // defaults to 1
}

export interface AdminUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  isInstanceAdmin: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601 with milliseconds (INV-06)
}

export interface AdminUserListResponse {
  items: AdminUserResponse[];
  total: number;
  page: number;
  pageSize: number; // = ADMIN_USERS_PAGE_SIZE
}

export interface UpdateAdminUserRequest {
  expectedUpdatedAt: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
}

export interface ChangeUserPasswordRequest {
  password: string;
}
