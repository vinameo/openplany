import type { AdminUserResponse } from '@repo/contracts';

export interface AdminUserSourceRow {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  isActive: boolean;
  isSuperuser: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Maps a User database entity/row into an AdminUserResponse (API B4, RQ INV-12).
 * Null string fields become empty strings; avatar -> avatarUrl; isSuperuser -> isInstanceAdmin;
 * dates are serialized to ISO 8601 strings.
 */
export function toAdminUserResponse(
  row: AdminUserSourceRow,
): AdminUserResponse {
  return {
    id: row.id,
    email: row.email ?? '',
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    displayName: row.displayName ?? '',
    avatarUrl: row.avatar ?? null,
    isActive: Boolean(row.isActive),
    isInstanceAdmin: Boolean(row.isSuperuser),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
