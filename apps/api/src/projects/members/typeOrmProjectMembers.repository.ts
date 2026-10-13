import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { projectMembersQuery } from '../projectFilters.js';
import type {
  ListProjectMembersOpts,
  ProjectMembersRepository,
} from './projectMembers.repository.js';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';

@Injectable()
export class TypeOrmProjectMembersRepository implements ProjectMembersRepository {
  private readonly logger = new Logger(TypeOrmProjectMembersRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }> {
    const qb = projectMembersQuery(this.dataSource.manager, { projectId })
      .select('pm.memberId', 'userId')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.avatar', 'avatarUrl')
      .addSelect('pm.role', 'assignedRole')
      .addSelect('wm.role', 'workspaceRole')
      .addSelect('pm.joinedAt', 'joinedAt')
      .addSelect('u.isActive', 'accountActive')
      .addSelect('count(*) OVER ()', 'total');

    if (opts.includeEmail) {
      qb.addSelect('u.email', 'email');
    }

    const rows = await qb
      .orderBy('array_position(CAST(:roleOrder AS varchar[]), pm.role)')
      .addOrderBy(
        `lower(COALESCE(NULLIF(btrim(u.firstName || ' ' || u.lastName), ''), u.displayName))`,
      )
      .addOrderBy('pm.memberId')
      .setParameter('roleOrder', opts.roleOrder)
      .limit(opts.limit)
      .getRawMany<ProjectMemberDbRow & { total: string | number }>();

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
    const members: ProjectMemberDbRow[] = rows.map((row) => ({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      email: opts.includeEmail ? row.email : null,
      assignedRole: row.assignedRole,
      workspaceRole: row.workspaceRole,
      joinedAt: row.joinedAt,
      accountActive: row.accountActive,
      total: row.total,
    }));

    return { members, total };
  }
}
