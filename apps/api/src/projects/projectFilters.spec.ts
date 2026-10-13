import { describe, expect, it, vi } from 'vitest';
import type { EntityManager, SelectQueryBuilder } from 'typeorm';
import { ProjectMember } from './entities/projectMember.entity.js';
import { assignedProjectAdmins } from './projectFilters.js';

describe('projectFilters - assignedProjectAdmins', () => {
  function makeMockQb(rows: { projectId: string; count: string | number }[]) {
    const innerJoin = vi.fn().mockReturnThis();
    const where = vi.fn().mockReturnThis();
    const andWhere = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const addSelect = vi.fn().mockReturnThis();
    const groupBy = vi.fn().mockReturnThis();
    const getRawMany = vi.fn().mockResolvedValue(rows);

    const qb = {
      connection: {},
      expressionMap: {},
      innerJoin,
      where,
      andWhere,
      select,
      addSelect,
      groupBy,
      getRawMany,
    } as unknown as SelectQueryBuilder<ProjectMember>;

    return {
      qb,
      innerJoin,
      where,
      andWhere,
      select,
      addSelect,
      groupBy,
      getRawMany,
    };
  }

  it('returns empty map when projectIds is empty without querying', async () => {
    const { qb, getRawMany } = makeMockQb([]);
    const result = await assignedProjectAdmins(qb, []);

    expect(result.size).toBe(0);
    expect(getRawMany).not.toHaveBeenCalled();
  });

  it('queries assigned Project Admins with qb and returns counts by project', async () => {
    const { qb, select, addSelect, andWhere, groupBy } = makeMockQb([
      { projectId: 'p-1', count: '2' },
      { projectId: 'p-2', count: 1 },
    ]);

    const result = await assignedProjectAdmins(qb, ['p-1', 'p-2']);

    expect(result.get('p-1')).toBe(2);
    expect(result.get('p-2')).toBe(1);
    expect(select).toHaveBeenCalledWith('pm.projectId', 'projectId');
    expect(addSelect).toHaveBeenCalledWith('count(*)', 'count');
    expect(andWhere).toHaveBeenCalledWith('u.isActive = :userActive', {
      userActive: true,
    });
    expect(andWhere).toHaveBeenCalledWith(
      'pm.role IN (:...projectAdminRoles)',
      expect.objectContaining({
        projectAdminRoles: ['admin'],
      }),
    );
    expect(groupBy).toHaveBeenCalledWith('pm.projectId');
  });

  it('builds query when manager is passed', async () => {
    const { qb } = makeMockQb([{ projectId: 'p-1', count: '1' }]);
    const createQueryBuilder = vi.fn().mockReturnValue(qb);
    const manager = {
      createQueryBuilder,
    } as unknown as EntityManager;

    const result = await assignedProjectAdmins(manager, ['p-1']);

    expect(result.get('p-1')).toBe(1);
    expect(createQueryBuilder).toHaveBeenCalledWith(ProjectMember, 'pm');
  });
});
