import type { ProjectMembersPreview } from '../dto/projectResponse.js';

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
  /**
   * Active members of each project, oldest first, at most `limitPerProject`
   * each, with the real total. Projects without members are absent.
   */
  abstract membersOf(
    projectIds: readonly string[],
    opts: { includeEmail: boolean; limitPerProject: number },
  ): Promise<Map<string, ProjectMembersPreview>>;

  abstract create(input: CreateProjectInput): Promise<{ projectId: string }>;

  abstract findIdByIdentifier(
    workspaceId: string,
    identifier: string,
  ): Promise<string | null>;
}
