import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { escapeLikePattern, type WorkspaceRole } from '@repo/contracts';
import { User } from '../../auth/entities/user.entity.js';
import { ADDABLE_USER } from '../../auth/addableUser.js';
import { equalsLowercase } from '../../database/findOperators.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { projectMembersQuery } from '../projectFilters.js';
import type {
  ListProjectMembersOpts,
  ProjectMemberCandidateDbRow,
  ProjectMembersRepository,
  SearchProjectMemberCandidatesInput,
} from './projectMembers.repository.js';
import type { ProjectMemberDbRow } from './dto/projectMemberResponse.js';

interface RawCandidateRow {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  email?: string;
  workspaceRole: WorkspaceRole;
  alreadyMember: boolean | number | string;
}

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

  async searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]> {
    const qb = this.dataSource.manager
      .createQueryBuilder(User, 'u')
      .innerJoin(
        WorkspaceMember,
        'wm',
        'wm.memberId = u.id AND wm.workspaceId = :workspaceId AND wm.isActive = true',
      );

    const membership = qb
      .subQuery()
      .select('1')
      .from(ProjectMember, 'pm')
      .where('pm.projectId = :projectId')
      .andWhere('pm.memberId = u.id')
      .andWhere('pm.isActive = true')
      .getQuery();

    qb.select('u.id', 'userId')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.avatar', 'avatarUrl')
      .addSelect('wm.role', 'workspaceRole')
      .addSelect(`EXISTS ${membership}`, 'alreadyMember');

    if (input.mode === 'contains') {
      const escaped = escapeLikePattern(input.query);
      qb.addSelect('u.email', 'email')
        .where(ADDABLE_USER)
        .andWhere(`lower(u.email) LIKE :patternAny ESCAPE '\\'`)
        .orderBy('(lower(u.email) = :query)', 'DESC')
        .addOrderBy(`(lower(u.email) LIKE :patternPrefix ESCAPE '\\')`, 'DESC')
        .addOrderBy('lower(u.email)', 'ASC')
        .setParameter('workspaceId', input.workspaceId)
        .setParameter('projectId', input.projectId)
        .setParameter('query', input.query)
        .setParameter('patternAny', `%${escaped}%`)
        .setParameter('patternPrefix', `${escaped}%`);
    } else {
      qb.where({
        ...ADDABLE_USER,
        email: equalsLowercase(input.query),
      })
        .setParameter('workspaceId', input.workspaceId)
        .setParameter('projectId', input.projectId);
    }

    const rows = await qb
      .limit(input.limit)
      .getRawMany<RawCandidateRow>();

    return rows.map((r) => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      email: input.mode === 'contains' ? (r.email ?? null) : null,
      workspaceRole: r.workspaceRole,
      alreadyMember: Boolean(r.alreadyMember),
    }));
  }
}
