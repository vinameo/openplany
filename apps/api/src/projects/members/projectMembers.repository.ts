import type { ProjectRole, WorkspaceRole } from '@repo/contracts';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';

export interface ListProjectMembersOpts {
  includeEmail: boolean;
  roleOrder: readonly ProjectRole[];
  limit: number;
}

export interface ProjectMemberCandidateDbRow {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  workspaceRole: WorkspaceRole;
  alreadyMember: boolean;
}

export interface SearchProjectMemberCandidatesInput {
  workspaceId: string;
  projectId: string;
  query: string;
  mode: 'contains' | 'exact';
  limit: number;
}

export abstract class ProjectMembersRepository {
  abstract list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }>;

  abstract searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]>;
}
