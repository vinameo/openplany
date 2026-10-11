import type { ProjectAccess, WorkspaceRole } from '@repo/contracts';
import type { ProjectMemberRow, ProjectRow } from '../dto/projectResponse.js';

export interface CreateProjectInput {
  workspaceId: string;
  actorId: string;
  requestId?: string;
  now: Date;
  name: string;
  identifier: string;
  description: string;
  iconName: string;
  iconColor: string;
  coverKey: string;
}

export abstract class ProjectsRepository {
  abstract membersOf(
    projectIds: readonly string[],
    opts: { includeEmail: boolean },
  ): Promise<Map<string, ProjectMemberRow[]>>;

  abstract create(input: CreateProjectInput): Promise<{ projectId: string }>;

  abstract findAccessible(input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
    projectId: string;
  }): Promise<{ project: ProjectRow; access: ProjectAccess } | null>;
}
