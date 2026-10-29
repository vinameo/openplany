import {
  effectiveProjectTimezone,
  enforcedProjectPermissions,
  type ProjectAccess,
  type ProjectListItem,
  type ProjectMemberSummary,
} from '@repo/contracts';

import type { Project } from '../entities/project.entity.js';

export interface ProjectRow {
  id: string;
  name: string;
  identifier: string;
  description: string;
  iconName: string;
  iconColor: string;
  coverKey: string;
  createdAt: Date;
  updatedAt: Date;
  timezone: string | null;
}

export function toProjectRow(project: Project): ProjectRow {
  return {
    id: project.id,
    name: project.name,
    identifier: project.identifier,
    description: project.description,
    iconName: project.iconName,
    iconColor: project.iconColor,
    coverKey: project.coverKey,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    timezone: project.timezone !== undefined ? project.timezone : null,
  };
}

export interface ProjectMemberRow {
  projectId: string;
  userId: string;
  addedAt: Date;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  accountActive: boolean;
}

/** First members of one project (already in display order) and the real total. */
export interface ProjectMembersPreview {
  members: ProjectMemberRow[];
  total: number;
}

/** `members` is null exactly when the viewer lacks project.members.view. */
export function toProjectListItem(
  row: ProjectRow,
  access: ProjectAccess,
  members: ProjectMembersPreview | null,
  workspaceTimezone: string,
): ProjectListItem {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    description: row.description,
    icon: {
      name: row.iconName,
      color: row.iconColor,
    },
    coverKey: row.coverKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    timezone: row.timezone,
    effectiveTimezone: effectiveProjectTimezone(
      row.timezone,
      workspaceTimezone,
    ),
    // The repository already orders members (oldest first); keep that order.
    members: members === null ? null : members.members.map(toMemberSummary),
    memberCount: members === null ? null : members.total,
    role: access.role,
    permissions: enforcedProjectPermissions(access.permissions),
  };
}

function toMemberSummary(m: ProjectMemberRow): ProjectMemberSummary {
  const summary: ProjectMemberSummary = {
    userId: m.userId,
    firstName: m.firstName,
    lastName: m.lastName,
    displayName: m.displayName,
    accountActive: m.accountActive,
  };
  // Only add the key when present: viewers without the email permission must not get `email` at all.
  if (m.email !== undefined) summary.email = m.email;
  return summary;
}
