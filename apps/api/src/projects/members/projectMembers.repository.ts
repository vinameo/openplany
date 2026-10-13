import type { ProjectRole } from '@repo/contracts';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';

export interface ListProjectMembersOpts {
  includeEmail: boolean;
  roleOrder: readonly ProjectRole[];
  limit: number;
}

export abstract class ProjectMembersRepository {
  abstract list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }>;
}
