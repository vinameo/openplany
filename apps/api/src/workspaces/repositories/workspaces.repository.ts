import type {
  EditableWorkspaceField,
  OrganizationSize,
  WorkspaceRole,
} from '@repo/contracts';

/** A workspace as seen by one member: the row plus that member's role and the head count. */
export interface MemberWorkspace {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  backgroundColor: string;
  organizationSize: OrganizationSize;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  role: WorkspaceRole;
  memberCount: number;
}

export type WorkspaceChanges = Partial<
  Pick<MemberWorkspace, EditableWorkspaceField>
>;

export interface NewWorkspace {
  id: string;
  name: string;
  slug: string;
  organizationSize: OrganizationSize;
  backgroundColor: string;
}

export type CreateWorkspaceResult =
  | { status: 'created'; workspace: MemberWorkspace }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'user_inactive' };

export class SlugAlreadyExistsError extends Error {
  constructor(message = 'Slug already exists') {
    super(message);
    this.name = 'SlugAlreadyExistsError';
  }
}

export abstract class WorkspacesRepository {
  /** Includes soft-deleted workspaces (4.1). */
  abstract slugExists(slug: string): Promise<boolean>;
  /** The whole 4.3 transaction. Throws SlugAlreadyExistsError on a slug race. */
  abstract create(
    userId: string,
    input: NewWorkspace,
    now: Date,
    requestId: string | null,
  ): Promise<CreateWorkspaceResult>;
  /** 4.4, ordered for display. */
  abstract listForMember(
    userId: string,
  ): Promise<{ workspaces: MemberWorkspace[]; lastWorkspaceId: string | null }>;
  /** 4.5. null = not found or not an active member. */
  abstract findForMember(
    slug: string,
    userId: string,
  ): Promise<MemberWorkspace | null>;
  abstract rememberLastWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void>;
  /**
   * Writes only the given fields plus updated_by_id/updated_at.
   * Callers never pass an empty `changes` (RQ 5.2).
   * Returns the stored updated_at, or null when the workspace is gone (soft-deleted).
   */
  abstract update(
    workspaceId: string,
    actorId: string,
    changes: WorkspaceChanges,
    now: Date,
  ): Promise<{ updatedAt: Date } | null>;
}

