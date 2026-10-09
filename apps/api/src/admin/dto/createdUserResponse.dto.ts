import type { CreatedUserResponse } from '@repo/contracts';

export interface UserRowForResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  createdAt: Date;
}

export function toCreatedUserResponse(row: UserRowForResponse): CreatedUserResponse {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    isInstanceAdmin: false,
    createdAt: row.createdAt.toISOString(),
  };
}

