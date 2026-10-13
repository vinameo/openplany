import type {
  ProjectActor,
  ProjectMemberNotAddableReason,
  ProjectPermission,
  ProjectRole,
  WorkspacePermission,
  WorkspaceRole,
} from '@repo/contracts';
import type {
  InheritedMemberDbRow,
  ProjectMemberDbRow,
} from './dto/projectMemberResponse.js';

export interface ListProjectMembersOpts {
  includeEmail: boolean;
  roleOrder: readonly ProjectRole[];
  limit: number;
  implicitRoles?: readonly WorkspaceRole[];
}

export interface ListInheritedProjectMembersOpts {
  implicitRoles: readonly WorkspaceRole[];
  includeEmail: boolean;
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
  /**
   * Why one row cannot be added, or null. Called only for workspace members
   * whose account can be added; the repository supplies the locked facts and
   * the service owns the rule.
   */
  rowRejection: (
    context: AddProjectMembersActorContext,
    target: {
      userId: string;
      workspaceRole: WorkspaceRole;
      alreadyMember: boolean;
    },
    role: ProjectRole,
  ) => ProjectMemberNotAddableReason | null;
}

export type AddProjectMembersResult =
  | {
      status: 'added';
      members: ProjectMemberDbRow[];
      reactivatedCount: number;
      assignedAdminCount: number;
    }
  | {
      status: 'rejected';
      rows: { index: number; reason: ProjectMemberNotAddableReason }[];
    }
  | { status: 'actor_forbidden' }
  | { status: 'role_forbidden' }
  /** The database rejected a role of the batch (foreign key on `roles`). */
  | { status: 'role_unknown' }
  | { status: 'project_gone' };

export abstract class ProjectMembersRepository {
  abstract list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }>;

  abstract listInherited(
    workspaceId: string,
    opts: ListInheritedProjectMembersOpts,
  ): Promise<{ members: InheritedMemberDbRow[]; total: number }>;

  abstract countAssignedAdmins(
    projectId: string,
    implicitRoles?: readonly WorkspaceRole[],
  ): Promise<number>;

  abstract searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]>;

  abstract addMembers(
    input: AddProjectMembersInput,
  ): Promise<AddProjectMembersResult>;
}

