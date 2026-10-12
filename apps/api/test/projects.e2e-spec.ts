import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_LIST_MAX,
  PROJECT_MEMBER_PREVIEW_MAX,
} from '@repo/contracts';
import { AppendOnlyViolationError } from '../src/database/appendOnly.js';
import { CreateProjectTables1791605000000 } from '../src/database/migrations/1791605000000-CreateProjectTables.js';
import { AddProjectForeignKeyIndexes1791606000000 } from '../src/database/migrations/1791606000000-AddProjectForeignKeyIndexes.js';
import { ReserveProjectIdentifiers1791607000000 } from '../src/database/migrations/1791607000000-ReserveProjectIdentifiers.js';
import { ProjectMemberRoleHistory } from '../src/projects/entities/projectMemberRoleHistory.entity.js';
import { ProjectsRepository } from '../src/projects/repositories/projects.repository.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser as createE2eUser,
  signInCookie as signInE2eCookie,
  DEFAULT_E2E_ORIGIN,
  DEFAULT_E2E_PASSWORD,
} from './helpers/e2eUsers.js';

const ORIGIN = DEFAULT_E2E_ORIGIN;
const PASSWORD = DEFAULT_E2E_PASSWORD;

describe('Projects (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  const createUser = (
    email: string | null,
    opts: Parameters<typeof createE2eUser>[2] = {},
  ) => createE2eUser(e2e, email, { is_superuser: false, ...opts });

  const signInCookie = (email: string) =>
    signInE2eCookie(e2e, email, PASSWORD, ORIGIN);

  async function seedWorkspace(ownerEmail: string, slug: string) {
    const ownerId = await createUser(ownerEmail, { is_superuser: true });
    const cookie = await signInCookie(ownerEmail);
    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: slug.toUpperCase(),
        slug,
        organizationSize: '2-10',
      })
      .expect(201);
    return { workspace: res.body, ownerId, cookie };
  }

  async function addWorkspaceMember(
    workspaceId: string,
    memberId: string,
    role: 'admin' | 'member' | 'guest',
    isActive = true,
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, now(), now(), now())`,
      [workspaceId, memberId, role, isActive],
    );
  }

  async function insertProject(
    workspaceId: string,
    name: string,
    identifier: string,
    deletedAt: Date | null = null,
  ): Promise<string> {
    const res = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, description, icon_name, icon_color, cover_key, deleted_at)
       VALUES ($1, $2, $3, '', $4, $5, $6, $7)
       RETURNING id`,
      [
        workspaceId,
        name,
        identifier,
        DEFAULT_PROJECT_ICON,
        DEFAULT_PROJECT_ICON_COLOR,
        DEFAULT_PROJECT_COVER,
        deletedAt,
      ],
    );
    return res[0]!.id;
  }

  async function insertProjectMember(
    projectId: string,
    workspaceId: string,
    memberId: string,
    role: 'admin' | 'contributor' | 'commenter' | 'guest',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role)
       VALUES ($1, $2, $3, $4)`,
      [projectId, workspaceId, memberId, role],
    );
  }

  describe('Database integrity (B6)', () => {
    it('T-DB-01: migration up/down/up runs cleanly and down drops all 3 tables', async () => {
      const migration = new CreateProjectTables1791605000000();
      // Later migrations on these tables are reverted first and re-applied last,
      // so the e2e database ends in the same state for the following tests.
      const indexes = new AddProjectForeignKeyIndexes1791606000000();
      const reserve = new ReserveProjectIdentifiers1791607000000();
      const qr = e2e.dataSource.createQueryRunner();
      await qr.connect();
      try {
        await reserve.down(qr);
        await indexes.down(qr);
        await migration.down(qr);

        const tablesAfterDown = await e2e.dataSource.query<
          { tablename: string }[]
        >(
          `SELECT tablename FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename IN ('projects', 'project_members', 'project_member_role_history')`,
        );
        expect(tablesAfterDown).toHaveLength(0);

        await migration.up(qr);

        const tablesAfterUp = await e2e.dataSource.query<
          { tablename: string }[]
        >(
          `SELECT tablename FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename IN ('projects', 'project_members', 'project_member_role_history')`,
        );
        expect(tablesAfterUp).toHaveLength(3);
        await indexes.up(qr);
        await reserve.up(qr);
      } finally {
        await qr.release();
      }
    });

    it('T-DB-09: every FK column a parent delete searches has a full (non-partial) index', async () => {
      const rows = await e2e.dataSource.query<
        { indexname: string; indexdef: string }[]
      >(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename IN ('projects', 'project_members', 'project_member_role_history')`,
      );
      const fullIndexes = rows.filter((r) => !/ WHERE /i.test(r.indexdef));
      const leadingColumns = fullIndexes.map((r) => {
        const cols = /\(([^)]*)\)/.exec(r.indexdef)?.[1] ?? '';
        return cols.split(',').map((c) => c.trim());
      });
      const covered = (table: string, cols: string[]) =>
        fullIndexes.some(
          (r, i) =>
            r.indexdef.includes(` ON public.${table} `) &&
            cols.every((c, k) => leadingColumns[i]![k] === c),
        );

      expect(covered('projects', ['workspace_id'])).toBe(true);
      expect(covered('projects', ['created_by_id'])).toBe(true);
      expect(covered('projects', ['updated_by_id'])).toBe(true);
      expect(covered('project_members', ['workspace_id', 'member_id'])).toBe(
        true,
      );
      expect(covered('project_members', ['created_by_id'])).toBe(true);
      expect(covered('project_member_role_history', ['workspace_id'])).toBe(
        true,
      );
      expect(covered('project_member_role_history', ['member_id'])).toBe(true);
      expect(covered('project_member_role_history', ['actor_id'])).toBe(true);
      expect(covered('project_member_role_history', ['project_id'])).toBe(true);
    });

    it("T-DB-10: a history row cannot name a workspace other than its project's", async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'ws-tdb10@openplany.dev',
        'tdb10-ws',
      );
      const { workspace: other } = await seedWorkspace(
        'other-tdb10@openplany.dev',
        'tdb10-other',
      );
      const projectId = await insertProject(
        workspace.id,
        'History Project',
        'HIST',
      );

      await expect(
        e2e.dataSource.query(
          `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, to_role, change_type)
           VALUES ($1, $2, $3, 'admin', 'project_created')`,
          [other.id, projectId, ownerId],
        ),
      ).rejects.toMatchObject({
        driverError: { constraint: 'pmrh_project_fkey' },
      });
    });

    it('T-DB-03: inserting project_members for non-workspace-member fails foreign key constraint', async () => {
      const { workspace } = await seedWorkspace(
        't-db-03-admin@openplany.dev',
        'tdb03-ws',
      );
      const outsiderId = await createUser('t-db-03-outsider@openplany.dev');
      const projectId = await insertProject(workspace.id, 'Project A', 'PA');

      let error: { driverError?: { code?: string }; code?: string } | undefined;
      try {
        await insertProjectMember(
          projectId,
          workspace.id,
          outsiderId,
          'contributor',
        );
      } catch (err) {
        error = err as { driverError?: { code?: string }; code?: string };
      }

      expect(error).toBeDefined();
      expect(error?.driverError?.code || error?.code).toBe('23503');
    });

    it('T-DB-04: duplicate name case-insensitively in same workspace fails; different workspace succeeds', async () => {
      const { workspace: ws1 } = await seedWorkspace(
        't-db-04-1@openplany.dev',
        'tdb04-ws1',
      );
      const { workspace: ws2 } = await seedWorkspace(
        't-db-04-2@openplany.dev',
        'tdb04-ws2',
      );

      await insertProject(ws1.id, 'Web', 'WEB');

      // Same workspace, different case:
      let error: { driverError?: { code?: string }; code?: string } | undefined;
      try {
        await insertProject(ws1.id, 'web', 'WEB2');
      } catch (err) {
        error = err as { driverError?: { code?: string }; code?: string };
      }
      expect(error).toBeDefined();
      expect(error?.driverError?.code || error?.code).toBe('23505');

      // Different workspace, same name:
      const ws2ProjectId = await insertProject(ws2.id, 'Web', 'WEB');
      expect(ws2ProjectId).toBeDefined();
    });

    it('T-DB-05: invalid identifier fails projects_identifier_check constraint', async () => {
      const { workspace } = await seedWorkspace(
        't-db-05@openplany.dev',
        'tdb05-ws',
      );

      for (const invalidIdentifier of ['dam', '1AB', 'ABCDEF']) {
        let error:
          { driverError?: { code?: string }; code?: string } | undefined;
        try {
          await insertProject(
            workspace.id,
            `Project ${invalidIdentifier}`,
            invalidIdentifier,
          );
        } catch (err) {
          error = err as { driverError?: { code?: string }; code?: string };
        }
        expect(error).toBeDefined();
        expect(['23514', '22001']).toContain(
          error?.driverError?.code || error?.code,
        );
      }
    });

    it('T-DB-06: history row constraints check shape and valid role foreign key', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        't-db-06@openplany.dev',
        'tdb06-ws',
      );
      const projectId = await insertProject(
        workspace.id,
        'History Check',
        'HC',
      );
      await insertProjectMember(projectId, workspace.id, ownerId, 'admin');

      // project_created with from_role != null fails pmrh_shape_check
      let shapeErr:
        { driverError?: { code?: string }; code?: string } | undefined;
      try {
        await e2e.dataSource.query(
          `INSERT INTO project_member_role_history
             (project_id, workspace_id, member_id, actor_id, from_role, to_role, change_type, request_id)
           VALUES ($1, $2, $3, $3, 'admin', 'admin', 'project_created', 'req-1')`,
          [projectId, workspace.id, ownerId],
        );
      } catch (err) {
        shapeErr = err as { driverError?: { code?: string }; code?: string };
      }
      expect(shapeErr).toBeDefined();
      expect(shapeErr?.driverError?.code || shapeErr?.code).toBe('23514');

      // to_role = 'owner' (invalid for project scope) fails pmrh_to_role_fkey
      let fkErr: { driverError?: { code?: string }; code?: string } | undefined;
      try {
        await e2e.dataSource.query(
          `INSERT INTO project_member_role_history
             (project_id, workspace_id, member_id, actor_id, from_role, to_role, change_type, request_id)
           VALUES ($1, $2, $3, $3, NULL, 'owner', 'project_created', 'req-1')`,
          [projectId, workspace.id, ownerId],
        );
      } catch (err) {
        fkErr = err as { driverError?: { code?: string }; code?: string };
      }
      expect(fkErr).toBeDefined();
      expect(fkErr?.driverError?.code || fkErr?.code).toBe('23503');
    });

    it('T-DB-07: updating or deleting ProjectMemberRoleHistory via TypeORM throws AppendOnlyViolationError', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        't-db-07@openplany.dev',
        'tdb07-ws',
      );
      const projectId = await insertProject(workspace.id, 'Append Only', 'AO');
      await insertProjectMember(projectId, workspace.id, ownerId, 'admin');

      await e2e.dataSource.query(
        `INSERT INTO project_member_role_history
           (project_id, workspace_id, member_id, actor_id, from_role, to_role, change_type, request_id)
         VALUES ($1, $2, $3, $3, NULL, 'admin', 'project_created', 'req-ao')`,
        [projectId, workspace.id, ownerId],
      );

      const repo = e2e.dataSource.getRepository(ProjectMemberRoleHistory);
      const rows = await repo.find({ where: { projectId } });
      expect(rows).toHaveLength(1);

      await expect(
        repo.update({ id: rows[0]!.id }, { toRole: 'contributor' }),
      ).rejects.toThrow(AppendOnlyViolationError);

      await expect(repo.remove(rows[0]!)).rejects.toThrow(
        AppendOnlyViolationError,
      );
    });

    it('T-DB-08: soft-deleting a project keeps its identifier reserved but frees its name', async () => {
      const { workspace } = await seedWorkspace(
        't-db-08@openplany.dev',
        'tdb08-ws',
      );

      const oldId = await insertProject(workspace.id, 'Web', 'WEB', new Date());
      expect(oldId).toBeDefined();

      const newIdWithSameName = await insertProject(workspace.id, 'Web', 'WEB2');
      expect(newIdWithSameName).toBeDefined();

      let error:
        | { driverError?: { code?: string; constraint?: string }; code?: string }
        | undefined;
      try {
        await insertProject(workspace.id, 'Web App', 'WEB');
      } catch (err) {
        error = err as {
          driverError?: { code?: string; constraint?: string };
          code?: string;
        };
      }
      expect(error).toBeDefined();
      expect(error?.driverError?.code || error?.code).toBe('23505');
      expect(error?.driverError?.constraint).toBe('projects_workspace_identifier_key');
    });

    it('T-DB-20: creating via API rejects taken identifier of soft-deleted project with 409 and accepts recycled name', async () => {
      const { workspace, cookie } = await seedWorkspace(
        't-db-20@openplany.dev',
        'tdb20-ws',
      );

      await insertProject(workspace.id, 'Deleted Project', 'TFP11', new Date());

      const conflictRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'New Project',
          identifier: 'TFP11',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(409);

      expect(conflictRes.body.code).toBe('PROJECT_IDENTIFIER_TAKEN');
      expect(conflictRes.body.fields?.identifier).toBeDefined();

      const createRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Deleted Project',
          identifier: 'NEW11',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(201);

      expect(createRes.body.project.name).toBe('Deleted Project');
      expect(createRes.body.project.identifier).toBe('NEW11');
    });

    it('T-DB-22: catalog check confirms projects_workspace_identifier_key has no WHERE predicate', async () => {
      const rows = await e2e.dataSource.query(
        `SELECT indexdef FROM pg_indexes
         WHERE tablename = 'projects' AND indexname = 'projects_workspace_identifier_key'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].indexdef).not.toContain('WHERE');
    });

    it('T-DB-23: findIdByIdentifier returns id if active, null if deleted, null if other workspace, null if lowercased', async () => {
      const { workspace: ws1 } = await seedWorkspace(
        'ws1-tdb23@openplany.dev',
        'ws1-tdb23',
      );
      const { workspace: ws2 } = await seedWorkspace(
        'ws2-tdb23@openplany.dev',
        'ws2-tdb23',
      );
      const repo = e2e.app.get(ProjectsRepository);

      const activeId = await insertProject(ws1.id, 'Active Proj', 'ACT1');
      await insertProject(
        ws1.id,
        'Deleted Proj',
        'DEL1',
        new Date('2026-10-01T00:00:00Z'),
      );

      // active in ws1 -> returns id
      expect(await repo.findIdByIdentifier(ws1.id, 'ACT1')).toBe(activeId);
      // deleted in ws1 -> returns null
      expect(await repo.findIdByIdentifier(ws1.id, 'DEL1')).toBeNull();
      // other workspace -> returns null
      expect(await repo.findIdByIdentifier(ws2.id, 'ACT1')).toBeNull();
      // lowercase exact match -> returns null
      expect(await repo.findIdByIdentifier(ws1.id, 'act1')).toBeNull();
    });
  });

  describe('GET /api/workspaces/:slug/projects', () => {
    it('returns 401 UNAUTHENTICATED without session cookie', async () => {
      const { workspace } = await seedWorkspace(
        'unauth@openplany.dev',
        'unauth-ws',
      );
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .expect(401);
    });

    it('returns 404 NOT_FOUND when requesting nonexistent workspace or non-member', async () => {
      const { workspace } = await seedWorkspace(
        'owner-404@openplany.dev',
        'ws-404',
      );
      await createUser('outsider@openplany.dev');
      const outsiderCookie = await signInCookie('outsider@openplany.dev');

      await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', outsiderCookie)
        .expect(404);

      await http()
        .get('/api/workspaces/nonexistent-slug/projects')
        .set('Cookie', outsiderCookie)
        .expect(404);
    });

    it('AC-09: member only sees projects they belong to; total matches', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'ws-ac09@openplany.dev',
        'ac09-ws',
      );
      const memberId = await createUser('member-ac09@openplany.dev');
      const memberCookie = await signInCookie('member-ac09@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const p1 = await insertProject(workspace.id, 'Project One', 'PONE');
      const p2 = await insertProject(workspace.id, 'Project Two', 'PTWO');

      // owner is in both, member is only in p1
      await insertProjectMember(p1, workspace.id, ownerId, 'admin');
      await insertProjectMember(p1, workspace.id, memberId, 'contributor');
      await insertProjectMember(p2, workspace.id, ownerId, 'admin');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.truncated).toBe(false);
      expect(res.body.projects).toHaveLength(1);
      expect(res.body.projects[0].name).toBe('Project One');
      expect(res.body.projects[0].identifier).toBe('PONE');
    });

    it('AC-10: workspace admin sees all projects even if not a member of them, and is not in members array', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('ws-ac10@openplany.dev', 'ac10-ws');
      const memberId = await createUser('member-ac10@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const p1 = await insertProject(workspace.id, 'Adminless Project', 'ALP');
      // Only memberId is in project_members
      await insertProjectMember(p1, workspace.id, memberId, 'admin');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.projects[0].name).toBe('Adminless Project');
      expect(res.body.projects[0].role).toBe('admin');
      // Admin is not in members array:
      const memberUserIds = res.body.projects[0].members.map(
        (m: { userId: string }) => m.userId,
      );
      expect(memberUserIds).not.toContain(ownerId);
      expect(memberUserIds).toContain(memberId);
    });

    it('AC-11: guest with no projects gets empty list and total 0', async () => {
      const { workspace } = await seedWorkspace(
        'ws-ac11@openplany.dev',
        'ac11-ws',
      );
      const guestId = await createUser('guest-ac11@openplany.dev');
      const guestCookie = await signInCookie('guest-ac11@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest');

      // Create a project with another user
      const otherId = await createUser('other-ac11@openplany.dev');
      await addWorkspaceMember(workspace.id, otherId, 'member');
      const p1 = await insertProject(workspace.id, 'Other Project', 'OP');
      await insertProjectMember(p1, workspace.id, otherId, 'admin');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.projects).toEqual([]);
      expect(res.body.truncated).toBe(false);
    });

    it('AC-12: deactivated account shows accountActive false; deactivated workspace member is excluded', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('ws-ac12@openplany.dev', 'ac12-ws');
      const userActiveId = await createUser('active-u@openplany.dev');
      const userDeactivatedId = await createUser(
        'deactivated-u@openplany.dev',
        {
          is_active: false,
        },
      );
      const wsMemberDeactivatedId = await createUser(
        'ws-deactivated-u@openplany.dev',
      );

      await addWorkspaceMember(workspace.id, userActiveId, 'member', true);
      await addWorkspaceMember(workspace.id, userDeactivatedId, 'member', true);
      await addWorkspaceMember(
        workspace.id,
        wsMemberDeactivatedId,
        'member',
        false,
      );

      const p1 = await insertProject(workspace.id, 'Activity Project', 'ACT');
      await insertProjectMember(p1, workspace.id, ownerId, 'admin');
      await insertProjectMember(p1, workspace.id, userActiveId, 'contributor');
      await insertProjectMember(
        p1,
        workspace.id,
        userDeactivatedId,
        'contributor',
      );
      await insertProjectMember(
        p1,
        workspace.id,
        wsMemberDeactivatedId,
        'contributor',
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      const members = res.body.projects[0].members as {
        userId: string;
        accountActive: boolean;
      }[];
      const memberIds = members.map((m) => m.userId);

      expect(memberIds).toContain(userActiveId);
      expect(memberIds).toContain(userDeactivatedId);
      // Inactive workspace member is excluded:
      expect(memberIds).not.toContain(wsMemberDeactivatedId);

      const deactivatedEntry = members.find(
        (m) => m.userId === userDeactivatedId,
      );
      expect(deactivatedEntry?.accountActive).toBe(false);

      const activeEntry = members.find((m) => m.userId === userActiveId);
      expect(activeEntry?.accountActive).toBe(true);
    });

    it('AC-13: email is omitted from JSON for viewer without email.view, included for viewer with permission', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('ws-ac13@openplany.dev', 'ac13-ws');
      const memberId = await createUser('member-ac13@openplany.dev');
      const memberCookie = await signInCookie('member-ac13@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const p1 = await insertProject(workspace.id, 'Email Project', 'EP');
      await insertProjectMember(p1, workspace.id, ownerId, 'admin');
      await insertProjectMember(p1, workspace.id, memberId, 'contributor');

      // Admin has workspace.members.email.view -> sees email
      const adminRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(JSON.stringify(adminRes.body)).toContain('"email"');

      // Standard member lacks workspace.members.email.view -> JSON never contains "email"
      const memberRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(JSON.stringify(memberRes.body)).not.toContain('"email"');
    });

    it('returns at most PROJECT_MEMBER_PREVIEW_MAX members per project with the real memberCount', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('owner-preview@openplany.dev', 'preview-ws');
      const projectId = await insertProject(workspace.id, 'Crowded', 'CROWD');
      await insertProjectMember(projectId, workspace.id, ownerId, 'admin');
      const extra = PROJECT_MEMBER_PREVIEW_MAX + 4;
      for (let i = 0; i < extra; i++) {
        const userId = await createUser(`preview-${i}@openplany.dev`);
        await addWorkspaceMember(workspace.id, userId, 'member');
        await insertProjectMember(
          projectId,
          workspace.id,
          userId,
          'contributor',
        );
      }

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      const project = res.body.projects[0];
      expect(project.members).toHaveLength(PROJECT_MEMBER_PREVIEW_MAX);
      expect(project.memberCount).toBe(extra + 1);
      expect(project.members[0].userId).toBe(ownerId);
    });

    it('reports the real total when the list is cut at PROJECT_LIST_MAX', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-total@openplany.dev',
        'total-ws',
      );
      const count = PROJECT_LIST_MAX + 7;
      await e2e.dataSource.query(
        `INSERT INTO projects (workspace_id, name, identifier, description, icon_name, icon_color, cover_key)
         SELECT $1, 'Project ' || g, 'P' || g, '', $2, $3, $4 FROM generate_series(1, $5) AS g`,
        [
          workspace.id,
          DEFAULT_PROJECT_ICON,
          DEFAULT_PROJECT_ICON_COLOR,
          DEFAULT_PROJECT_COVER,
          count,
        ],
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.projects).toHaveLength(PROJECT_LIST_MAX);
      expect(res.body.total).toBe(count);
      expect(res.body.truncated).toBe(true);
    });

    it('AC-14: user lacking project.members.view sees members: null', async () => {
      const { workspace } = await seedWorkspace(
        'ws-ac14@openplany.dev',
        'ac14-ws',
      );
      const guestId = await createUser('guest-ac14@openplany.dev');
      const guestCookie = await signInCookie('guest-ac14@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest');

      const p1 = await insertProject(
        workspace.id,
        'Secret Members Project',
        'SMP',
      );
      // Assign guest role to the guest user in the project
      await insertProjectMember(p1, workspace.id, guestId, 'guest');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.projects[0].members).toBeNull();
      expect(res.body.projects[0].memberCount).toBeNull();
    });
  });

  describe('POST /api/workspaces/:slug/projects', () => {
    it('AC-01 & AC-23: admin creates project -> 201; 1 member (creator, admin); 1 history row; response matches GET', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('admin-create@openplany.dev', 'create-ws');

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .set('X-Request-Id', 'req-create-1')
        .send({
          name: 'Mobile App',
          identifier: 'MAPP',
          description: 'A mobile application',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-02',
        })
        .expect(201);

      expect(res.body.project).toBeDefined();
      const proj = res.body.project;
      expect(proj.name).toBe('Mobile App');
      expect(proj.identifier).toBe('MAPP');
      expect(proj.description).toBe('A mobile application');
      expect(proj.icon).toEqual({ name: 'rocket', color: '#15AABF' });
      expect(proj.coverKey).toBe('cover-02');
      expect(proj.role).toBe('admin');
      expect(proj.permissions).toContain('project.members.view');
      expect(proj.members).toHaveLength(1);
      expect(proj.members[0].userId).toBe(ownerId);

      // Verify DB tables
      const projectsInDb = await e2e.dataSource.query<
        { id: string; name: string }[]
      >(`SELECT id, name FROM projects WHERE id = $1`, [proj.id]);
      expect(projectsInDb).toHaveLength(1);

      const membersInDb = await e2e.dataSource.query<
        { member_id: string; role: string }[]
      >(`SELECT member_id, role FROM project_members WHERE project_id = $1`, [
        proj.id,
      ]);
      expect(membersInDb).toHaveLength(1);
      expect(membersInDb[0]!.member_id).toBe(ownerId);
      expect(membersInDb[0]!.role).toBe('admin');

      const historyInDb = await e2e.dataSource.query<
        { change_type: string; request_id: string; to_role: string }[]
      >(
        `SELECT change_type, request_id, to_role FROM project_member_role_history WHERE project_id = $1`,
        [proj.id],
      );
      expect(historyInDb).toHaveLength(1);
      expect(historyInDb[0]!.change_type).toBe('project_created');
      expect(historyInDb[0]!.request_id).toBe('req-create-1');
      expect(historyInDb[0]!.to_role).toBe('admin');

      // Verify AC-23: GET response row matches POST response
      const getRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(getRes.body.projects[0]).toEqual(proj);
    });

    it('AC-03: standard member calling POST gets 403; GET /workspaces/:slug lacks workspace.projects.create', async () => {
      const { workspace } = await seedWorkspace(
        'owner-ac03@openplany.dev',
        'ac03-ws',
      );
      const memberId = await createUser('member-ac03@openplany.dev');
      const memberCookie = await signInCookie('member-ac03@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const wsRes = await http()
        .get(`/api/workspaces/${workspace.slug}`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(wsRes.body.permissions).not.toContain('workspace.projects.create');

      await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Forbidden Project',
          identifier: 'FORB',
          icon: { name: 'star', color: '#FAB005' },
          coverKey: 'cover-01',
        })
        .expect(403);
    });

    it('AC-04: granting workspace.projects.create allows member to create project as project admin', async () => {
      const { workspace } = await seedWorkspace(
        'owner-ac04@openplany.dev',
        'ac04-ws',
      );
      const memberId = await createUser('member-ac04@openplany.dev');
      const memberCookie = await signInCookie('member-ac04@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      // Grant workspace.projects.create to workspace member role in role_permissions
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
         VALUES ('workspace', 'member', 'workspace.projects.create', now())`,
      );

      const wsRes = await http()
        .get(`/api/workspaces/${workspace.slug}`)
        .set('Cookie', memberCookie)
        .expect(200);

      expect(wsRes.body.permissions).toContain('workspace.projects.create');

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Member Project',
          identifier: 'MEMB',
          icon: { name: 'heart', color: '#FF8787' },
          coverKey: 'cover-03',
        })
        .expect(201);

      expect(res.body.project.role).toBe('admin');
      expect(res.body.project.members[0].userId).toBe(memberId);
    });

    it('AC-05: duplicate name or identifier returns 409; concurrent creations result in one 201 and one 409', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-ac05@openplany.dev',
        'ac05-ws',
      );

      await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Dự án Mobile',
          identifier: 'DAM',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(201);

      // Duplicate name (case difference):
      const dupNameRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'dự án mobile',
          identifier: 'DAM2',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(409);

      expect(dupNameRes.body.code).toBe('PROJECT_NAME_TAKEN');
      expect(dupNameRes.body.fields.name).toBe(
        'A project with this name already exists',
      );

      // Duplicate name in Unicode NFD form:
      const nfdName = 'Dự án Mobile'.normalize('NFD');
      const dupNfdRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: nfdName,
          identifier: 'DAM3',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(409);
      expect(dupNfdRes.body.code).toBe('PROJECT_NAME_TAKEN');

      // Duplicate identifier:
      const dupIdRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Another Project',
          identifier: 'DAM',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(409);

      expect(dupIdRes.body.code).toBe('PROJECT_IDENTIFIER_TAKEN');
      expect(dupIdRes.body.fields.identifier).toBe(
        'This project ID is already used',
      );

      // Concurrent POST race:
      const [res1, res2] = await Promise.all([
        http()
          .post(`/api/workspaces/${workspace.slug}/projects`)
          .set('Cookie', adminCookie)
          .set('Origin', ORIGIN)
          .send({
            name: 'Parallel Project',
            identifier: 'PAR1',
            icon: { name: 'rocket', color: '#15AABF' },
            coverKey: 'cover-01',
          }),
        http()
          .post(`/api/workspaces/${workspace.slug}/projects`)
          .set('Cookie', adminCookie)
          .set('Origin', ORIGIN)
          .send({
            name: 'Parallel Project',
            identifier: 'PAR2',
            icon: { name: 'rocket', color: '#15AABF' },
            coverKey: 'cover-01',
          }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    });

    it('AC-08 & AC-15: invalid fields and unexpected properties are rejected with 400', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-ac08@openplany.dev',
        'ac08-ws',
      );

      // Invalid identifier (lowercase)
      await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Bad ID Project',
          identifier: 'bad',
          icon: { name: 'star', color: '#FAB005' },
          coverKey: 'cover-01',
        })
        .expect(400);

      // Unexpected fields (visibility, leadId)
      const extraRes = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Extra Fields',
          identifier: 'EXTRA',
          icon: { name: 'star', color: '#FAB005' },
          coverKey: 'cover-01',
          visibility: 'public',
          leadId: 'u-1',
        })
        .expect(400);

      expect(extraRes.body.fields).toBeDefined();
    });

    it('rejects a missing, array or empty icon with 400, not 500', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-icon400@openplany.dev',
        'icon400-ws',
      );
      const base = {
        name: 'Icon Shape',
        identifier: 'ICON',
        coverKey: 'cover-01',
      };

      for (const icon of [
        undefined,
        [],
        [{ name: 'home', color: '#000000' }],
        null,
        'home',
      ]) {
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects`)
          .set('Cookie', adminCookie)
          .set('Origin', ORIGIN)
          .send(icon === undefined ? base : { ...base, icon })
          .expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fields.icon).toBe('Choose an icon');
      }

      const projects = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT count(*) FROM projects WHERE workspace_id = $1`,
        [workspace.id],
      );
      expect(Number(projects[0]!.count)).toBe(0);
    });

    it('rejects control characters in the description with 400 and accepts multi-line text', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-desc400@openplany.dev',
        'desc400-ws',
      );
      const base = {
        name: 'Described',
        identifier: 'DESC',
        icon: { name: 'star', color: '#FAB005' },
        coverKey: 'cover-01',
      };

      const nul = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ ...base, description: 'abc\u0000' })
        .expect(400);
      expect(nul.body.fields.description).toBe(
        "Contains characters that aren't allowed",
      );

      const ok = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ ...base, description: 'Line 1\nLine 2\tTabbed' })
        .expect(201);
      expect(ok.body.project.description).toBe('Line 1\nLine 2\tTabbed');
    });

    it('AC-19: trims whitespace and normalizes project name before saving', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'owner-ac19@openplany.dev',
        'ac19-ws',
      );

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          name: '  Trimmed Project  ',
          identifier: 'TRIM',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(201);

      expect(res.body.project.name).toBe('Trimmed Project');
    });
  });

  describe('GET /api/workspaces/:slug/projects/:identifier', () => {
    it('returns 401 UNAUTHENTICATED without session cookie (AC-18)', async () => {
      const { workspace } = await seedWorkspace(
        'unauth-get@openplany.dev',
        'unauth-get-ws',
      );
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PONE`)
        .expect(401);
    });

    it('returns 404 NOT_FOUND when requesting nonexistent workspace or non-member (AC-17)', async () => {
      const { workspace } = await seedWorkspace(
        'owner-404-get@openplany.dev',
        'ws-404-get',
      );
      await createUser('outsider-get@openplany.dev');
      const outsiderCookie = await signInCookie('outsider-get@openplany.dev');

      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PONE`)
        .set('Cookie', outsiderCookie)
        .expect(404);

      await http()
        .get('/api/workspaces/nonexistent-slug/projects/PONE')
        .set('Cookie', outsiderCookie)
        .expect(404);
    });

    it('returns 404 PROJECT_NOT_FOUND when project does not exist or lowercase (AC-11, AC-13)', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-pnotfound@openplany.dev',
        'ws-pnotfound',
      );
      await insertProject(workspace.id, 'My Project', 'MYPR');

      const res404 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/NOPE`)
        .set('Cookie', cookie)
        .expect(404);
      expect(res404.body.code).toBe('PROJECT_NOT_FOUND');
      expect(res404.body.message).toBe("This project doesn't exist.");

      // lowercase doesn't match
      const resLower = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/mypr`)
        .set('Cookie', cookie)
        .expect(404);
      expect(resLower.body.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 200 with project item matching GET .../projects element exactly (AC-24, INV-01)', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-match@openplany.dev',
        'ws-match',
      );
      const pId = await insertProject(workspace.id, 'Alpha Project', 'ALPHA');
      await insertProjectMember(pId, workspace.id, ownerId, 'admin');

      const listRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      const listItem = listRes.body.projects.find(
        (p: { identifier: string }) => p.identifier === 'ALPHA',
      );
      expect(listItem).toBeDefined();

      const getRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/ALPHA`)
        .set('Cookie', cookie)
        .expect(200);

      expect(getRes.headers['cache-control']).toBe('no-store');
      expect(getRes.body).toEqual({ project: listItem });
    });

    it('returns 404 PROJECT_NOT_FOUND when project has been soft-deleted (AC-19)', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-del@openplany.dev',
        'ws-del',
      );
      const pId = await insertProject(
        workspace.id,
        'Deleted Proj',
        'DEL1',
        new Date(),
      );
      await insertProjectMember(pId, workspace.id, ownerId, 'admin');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/DEL1`)
        .set('Cookie', cookie)
        .expect(404);

      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
      expect(res.body.message).toBe("This project doesn't exist.");
    });

    it('returns 403 FORBIDDEN without project data when workspace member does not belong to project (AC-14)', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'owner-priv@openplany.dev',
        'ws-priv',
      );
      const memberId = await createUser('member-priv@openplany.dev');
      const memberCookie = await signInCookie('member-priv@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const pId = await insertProject(
        workspace.id,
        'Super Secret Name',
        'SEC1',
      );
      await insertProjectMember(pId, workspace.id, ownerId, 'admin');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/SEC1`)
        .set('Cookie', memberCookie)
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe("You don't have access to this project.");
      expect(res.body).not.toHaveProperty('project');
      expect(JSON.stringify(res.body)).not.toContain('Super Secret Name');
    });

    it('returns 200 with role="admin" when workspace admin is not a project member (AC-15)', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-nonmember@openplany.dev',
        'ws-admin-nm',
      );
      const memberId = await createUser('member-nm@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const pId = await insertProject(
        workspace.id,
        'Member Only Proj',
        'MOP1',
      );
      await insertProjectMember(pId, workspace.id, memberId, 'contributor');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/MOP1`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(res.body.project.role).toBe('admin');
      expect(res.body.project.identifier).toBe('MOP1');
    });

    it('returns 200 for guest in project, 403 for guest not in project (AC-16)', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'owner-gst@openplany.dev',
        'ws-gst',
      );
      const guestId = await createUser('guest-user@openplany.dev');
      const guestCookie = await signInCookie('guest-user@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest');

      const p1Id = await insertProject(workspace.id, 'Guest Allowed', 'GST1');
      await insertProjectMember(p1Id, workspace.id, ownerId, 'admin');
      await insertProjectMember(p1Id, workspace.id, guestId, 'guest');

      const p2Id = await insertProject(workspace.id, 'Guest Denied', 'GST2');
      await insertProjectMember(p2Id, workspace.id, ownerId, 'admin');

      // Guest in p1 -> 200
      const res1 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/GST1`)
        .set('Cookie', guestCookie)
        .expect(200);
      expect(res1.body.project.identifier).toBe('GST1');

      // Guest not in p2 -> 403
      const res2 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/GST2`)
        .set('Cookie', guestCookie)
        .expect(403);
      expect(res2.body.code).toBe('FORBIDDEN');
    });

    it('returns members: null and memberCount: null when viewer has project role guest (AC-27)', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'owner-gprev@openplany.dev',
        'ws-gprev',
      );
      const guestId = await createUser('guest-prev@openplany.dev');
      const guestCookie = await signInCookie('guest-prev@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest');

      const pId = await insertProject(workspace.id, 'Guest Project', 'GPR1');
      await insertProjectMember(pId, workspace.id, ownerId, 'admin');
      await insertProjectMember(pId, workspace.id, guestId, 'guest');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/GPR1`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(res.body.project.members).toBeNull();
      expect(res.body.project.memberCount).toBeNull();
    });

    it('omits email from JSON for member viewer, includes email for admin viewer (AC-24)', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('owner-email@openplany.dev', 'ws-email');
      const memberId = await createUser('member-email@openplany.dev');
      const memberCookie = await signInCookie('member-email@openplany.dev');
      await addWorkspaceMember(workspace.id, memberId, 'member');

      const pId = await insertProject(workspace.id, 'Email Proj', 'EML1');
      await insertProjectMember(pId, workspace.id, ownerId, 'admin');
      await insertProjectMember(pId, workspace.id, memberId, 'contributor');

      // Admin sees email
      const adminRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/EML1`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(JSON.stringify(adminRes.body)).toContain('"email"');

      // Member does not see email
      const memberRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/EML1`)
        .set('Cookie', memberCookie)
        .expect(200);
      expect(JSON.stringify(memberRes.body)).not.toContain('"email"');
    });

    it('isolates same identifier in different workspaces (INV-02)', async () => {
      const { workspace: ws1, ownerId: owner1 } = await seedWorkspace(
        'owner-ws1@openplany.dev',
        'ws-iso-1',
      );
      const { workspace: ws2, ownerId: owner2 } = await seedWorkspace(
        'owner-ws2@openplany.dev',
        'ws-iso-2',
      );

      const userId = await createUser('user-cross@openplany.dev');
      const userCookie = await signInCookie('user-cross@openplany.dev');

      // User is in both workspaces as 'member'
      await addWorkspaceMember(ws1.id, userId, 'member');
      await addWorkspaceMember(ws2.id, userId, 'member');

      // Identifier SHARE in WS1 -> user is project contributor
      const p1 = await insertProject(ws1.id, 'Share One', 'SHARE');
      await insertProjectMember(p1, ws1.id, owner1, 'admin');
      await insertProjectMember(p1, ws1.id, userId, 'contributor');

      // Identifier SHARE in WS2 -> user is NOT project member
      const p2 = await insertProject(ws2.id, 'Share Two', 'SHARE');
      await insertProjectMember(p2, ws2.id, owner2, 'admin');

      // Access ws1 -> 200
      const res1 = await http()
        .get(`/api/workspaces/${ws1.slug}/projects/SHARE`)
        .set('Cookie', userCookie)
        .expect(200);
      expect(res1.body.project.name).toBe('Share One');

      // Access ws2 -> 403
      const res2 = await http()
        .get(`/api/workspaces/${ws2.slug}/projects/SHARE`)
        .set('Cookie', userCookie)
        .expect(403);
      expect(res2.body.code).toBe('FORBIDDEN');
    });
  });
});

