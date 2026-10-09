import {
  enforcedWorkspacePermissionsOf,
  type WorkspaceResponse,
} from '@repo/contracts';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';

export function toWorkspaceResponse(
  workspace: MemberWorkspace,
): WorkspaceResponse {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    logoUrl: workspace.logo,
    backgroundColor: workspace.backgroundColor,
    organizationSize: workspace.organizationSize,
    timezone: workspace.timezone,
    role: workspace.role,
    permissions: enforcedWorkspacePermissionsOf(workspace.role),
    memberCount: Number(workspace.memberCount),
    createdAt:
      workspace.createdAt instanceof Date
        ? workspace.createdAt.toISOString()
        : new Date(workspace.createdAt).toISOString(),
    updatedAt:
      workspace.updatedAt instanceof Date
        ? workspace.updatedAt.toISOString()
        : new Date(workspace.updatedAt).toISOString(),
  };
}
