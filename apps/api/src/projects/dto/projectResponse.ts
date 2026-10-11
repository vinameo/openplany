import {
  enforcedProjectPermissions,
  type ProjectAccess,
  type ProjectListItem,
  type ProjectMemberSummary,
} from '@repo/contracts';

export interface ProjectRow {
  id: string;
  name: string;
  identifier: string;
  description: string;
  iconName: string;
  iconColor: string;
  coverKey: string;
  createdAt: Date;
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

export function toProjectListItem(
  row: ProjectRow,
  access: ProjectAccess,
  members: ProjectMemberRow[] | null,
): ProjectListItem {
  const canViewMembers = access.permissions.includes('project.members.view');

  let memberSummaries: ProjectMemberSummary[] | null = null;
  if (canViewMembers && members !== null) {
    const sortedMembers = [...members].sort((a, b) => {
      const timeDiff =
        new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.userId.localeCompare(b.userId);
    });

    memberSummaries = sortedMembers.map((m) => {
      const summary: ProjectMemberSummary = {
        userId: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        displayName: m.displayName,
        accountActive: m.accountActive,
      };
      if (m.email !== undefined && m.email !== null) {
        summary.email = m.email;
      }
      return summary;
    });
  }

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
    members: memberSummaries,
    role: access.role,
    permissions: enforcedProjectPermissions(access.permissions),
  };
}
