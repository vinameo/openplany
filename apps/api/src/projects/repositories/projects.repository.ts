import type { ProjectRole, WorkspaceRole } from '@repo/contracts';
import type {
  ProjectMembersPreview,
  ProjectRow,
} from '../dto/projectResponse.js';

export interface MembersOfOpts {
  workspaceId?: string;
  showInherited?: boolean;
  implicitRoles: readonly WorkspaceRole[];
  includeEmail: boolean;
  limitPerProject: number;
}

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
  creatorRole?: ProjectRole | null;
}

export interface UpdateProjectInput {
  projectId: string;
  workspaceId: string;
  actorId: string;
  now: Date;
  changes: Partial<{
    name: string;
    description: string;
    iconName: string;
    iconColor: string;
    coverKey: string;
    timezone: string | null;
  }>;
}

export interface SoftDeleteProjectInput {
  projectId: string;
  workspaceId: string;
  actorId: string;
  now: Date;
}

export abstract class ProjectsRepository {
  /**
   * Active members of each project, oldest first, at most `limitPerProject`
   * each, with the real total. Projects without members are absent.
   */
  abstract membersOf(
    projectIds: readonly string[],
    opts: MembersOfOpts,
  ): Promise<Map<string, ProjectMembersPreview>>;

  abstract create(input: CreateProjectInput): Promise<{ projectId: string }>;

  abstract update(input: UpdateProjectInput): Promise<ProjectRow | null>;

  abstract softDelete(input: SoftDeleteProjectInput): Promise<boolean>;
}
