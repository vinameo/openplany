import type { ProjectRole, WorkspaceRole } from '@repo/contracts';
import type {
  ProjectMembersPreview,
  ProjectRow,
} from '../dto/projectResponse.js';

export interface MembersOfOpts {
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
  /**
   * The creator's project role, decided from their workspace role as read
   * (and locked) inside the create transaction. null: implicit access, no row.
   */
  creatorRoleFor: (workspaceRole: WorkspaceRole) => ProjectRole | null;
}

export type CreateProjectResult =
  | {
      status: 'created';
      projectId: string;
      creatorWorkspaceRole: WorkspaceRole;
    }
  /** The creator's workspace membership ended before the transaction. */
  | { status: 'creator_gone' };

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

  abstract create(input: CreateProjectInput): Promise<CreateProjectResult>;

  abstract update(input: UpdateProjectInput): Promise<ProjectRow | null>;

  abstract softDelete(input: SoftDeleteProjectInput): Promise<boolean>;
}
