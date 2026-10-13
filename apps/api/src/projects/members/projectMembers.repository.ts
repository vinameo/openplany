import type {
  ProjectActor,
  ProjectMemberNotAddableReason,
  ProjectPermission,
  ProjectRole,
  WorkspacePermission,
  WorkspaceRole,
} from '@repo/contracts';
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

export interface AddProjectMembersActorContext {
  actor: ProjectActor;
  projectPermissions: readonly ProjectPermission[];
  workspacePermissions: readonly WorkspacePermission[];
}

export interface AddProjectMembersInput {
  workspaceId: string;
  projectId: string;
  actorId: string;
  requestId: string;
  now: Date;
  includeEmail: boolean;
  members: readonly { userId: string; role: ProjectRole }[];
  canAdd: (context: AddProjectMembersActorContext) => boolean;
  roleRange: (context: AddProjectMembersActorContext) => readonly ProjectRole[];
  addableRolesFor: (
    context: AddProjectMembersActorContext,
    target: { userId: string; workspaceRole: WorkspaceRole },
  ) => readonly ProjectRole[];
}

export type AddProjectMembersResult =
  | {
      status: 'added';
      members: ProjectMemberDbRow[];
      reactivatedCount: number;
    }
  | {
      status: 'rejected';
      rows: { index: number; reason: ProjectMemberNotAddableReason }[];
    }
  | { status: 'actor_forbidden' }
  | { status: 'role_forbidden' }
  | { status: 'project_gone' };

export abstract class ProjectMembersRepository {
  abstract list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }>;

  abstract searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]>;

  abstract addMembers(
    input: AddProjectMembersInput,
  ): Promise<AddProjectMembersResult>;
}
