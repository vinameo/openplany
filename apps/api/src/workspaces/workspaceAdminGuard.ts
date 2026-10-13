import type { EntityManager } from 'typeorm';
import { WORKSPACE_ROLE_CHANGE_MESSAGES } from '@repo/contracts';
import { countActiveWorkspaceAdmins } from './workspaceFilters.js';

export class LastAdminError extends Error {
  constructor(message: string = WORKSPACE_ROLE_CHANGE_MESSAGES.lastAdmin) {
    super(message);
    this.name = 'LastAdminError';
  }
}

/**
 * Ensures a workspace retains at least one active Workspace Admin after excluding
 * a target member (RQ D13, INV-03, BA ADR-04).
 * Must be called after locking the workspaces row with for_no_key_update.
 */
export async function assertWorkspaceKeepsAdmin(
  manager: EntityManager,
  workspaceId: string,
  opts: { excludeMemberId: string },
): Promise<void> {
  const count = await countActiveWorkspaceAdmins(manager, workspaceId, opts);
  if (count === 0) {
    throw new LastAdminError();
  }
}
