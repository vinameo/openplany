import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { DEFAULT_PROJECT_COVER, DEFAULT_PROJECT_ICON, DEFAULT_PROJECT_ICON_COLOR } from '@repo/contracts';
import { AppendOnlyViolationError } from '../src/database/appendOnly.js';
import { CreateProjectTables1791605000000 } from '../src/database/migrations/1791605000000-CreateProjectTables.js';
import { ProjectMemberRoleHistory } from '../src/projects/entities/projectMemberRoleHistory.entity.js';
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
      const qr = e2e.dataSource.createQueryRunner();
      await qr.connect();
      try {
        await migration.down(qr);

        const tablesAfterDown = await e2e.dataSource.query<{ tablename: string }[]>(
          `SELECT tablename FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename IN ('projects', 'project_members', 'project_member_role_history')`,
        );
        expect(tablesAfterDown).toHaveLength(0);

        await migration.up(qr);

        const tablesAfterUp = await e2e.dataSource.query<{ tablename: string }[]>(
          `SELECT tablename FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename IN ('projects', 'project_members', 'project_member_role_history')`,
        );
        expect(tablesAfterUp).toHaveLength(3);
      } finally {
        await qr.release();
      }
    });

    it('T-DB-03: inserting project_members for non-workspace-member fails foreign key constraint', async () => {
      const { workspace } = await seedWorkspace('t-db-03-admin@openplany.dev', 'tdb03-ws');
      const outsiderId = await createUser('t-db-03-outsider@openplany.dev');
      const projectId = await insertProject(workspace.id, 'Project A', 'PA');

      let error: { driverError?: { code?: string }; code?: string } | undefined;
      try {
        await insertProjectMember(projectId, workspace.id, outsiderId, 'contributor');
      } catch (err) {
        error = err as { driverError?: { code?: string }; code?: string };
      }

      expect(error).toBeDefined();
      expect(error?.driverError?.code || error?.code).toBe('23503');
    });

    it('T-DB-04: duplicate name case-insensitively in same workspace fails; different workspace succeeds', async () => {
      const { workspace: ws1 } = await seedWorkspace('t-db-04-1@openplany.dev', 'tdb04-ws1');
      const { workspace: ws2 } = await seedWorkspace('t-db-04-2@openplany.dev', 'tdb04-ws2');

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
      const { workspace } = await seedWorkspace('t-db-05@openplany.dev', 'tdb05-ws');

      for (const invalidIdentifier of ['dam', '1AB', 'ABCDEF']) {
        let error: { driverError?: { code?: string }; code?: string } | undefined;
        try {
          await insertProject(workspace.id, `Project ${invalidIdentifier}`, invalidIdentifier);
        } catch (err) {
          error = err as { driverError?: { code?: string }; code?: string };
        }
        expect(error).toBeDefined();
        expect(['23514', '22001']).toContain(error?.driverError?.code || error?.code);
      }
    });

    it('T-DB-06: history row constraints check shape and valid role foreign key', async () => {
      const { workspace, ownerId } = await seedWorkspace('t-db-06@openplany.dev', 'tdb06-ws');
      const projectId = await insertProject(workspace.id, 'History Check', 'HC');
      await insertProjectMember(projectId, workspace.id, ownerId, 'admin');

      // project_created with from_role != null fails pmrh_shape_check
      let shapeErr: { driverError?: { code?: string }; code?: string } | undefined;
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
      const { workspace, ownerId } = await seedWorkspace('t-db-07@openplany.dev', 'tdb07-ws');
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

    it('T-DB-08: soft-deleting a project allows creating another with identical name and identifier', async () => {
      const { workspace } = await seedWorkspace('t-db-08@openplany.dev', 'tdb08-ws');

      const oldId = await insertProject(workspace.id, 'Web', 'WEB', new Date());
      expect(oldId).toBeDefined();

      const newId = await insertProject(workspace.id, 'Web', 'WEB');
      expect(newId).toBeDefined();
      expect(newId).not.toBe(oldId);
    });
  });

  describe('GET /api/workspaces/:slug/projects', () => {
    it('returns 401 UNAUTHENTICATED without session cookie', async () => {
      const { workspace } = await seedWorkspace('unauth@openplany.dev', 'unauth-ws');
      await http().get(`/api/workspaces/${workspace.slug}/projects`).expect(401);
    });

    it('returns 404 NOT_FOUND when requesting nonexistent workspace or non-member', async () => {
      const { workspace } = await seedWorkspace('owner-404@openplany.dev', 'ws-404');
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
      const { workspace, ownerId } = await seedWorkspace('ws-ac09@openplany.dev', 'ac09-ws');
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
      const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
        'ws-ac10@openplany.dev',
        'ac10-ws',
      );
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
      const memberUserIds = res.body.projects[0].members.map((m: { userId: string }) => m.userId);
      expect(memberUserIds).not.toContain(ownerId);
      expect(memberUserIds).toContain(memberId);
    });

    it('AC-11: guest with no projects gets empty list and total 0', async () => {
      const { workspace } = await seedWorkspace('ws-ac11@openplany.dev', 'ac11-ws');
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
      const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
        'ws-ac12@openplany.dev',
        'ac12-ws',
      );
      const userActiveId = await createUser('active-u@openplany.dev');
      const userDeactivatedId = await createUser('deactivated-u@openplany.dev', {
        is_active: false,
      });
      const wsMemberDeactivatedId = await createUser('ws-deactivated-u@openplany.dev');

      await addWorkspaceMember(workspace.id, userActiveId, 'member', true);
      await addWorkspaceMember(workspace.id, userDeactivatedId, 'member', true);
      await addWorkspaceMember(workspace.id, wsMemberDeactivatedId, 'member', false);

      const p1 = await insertProject(workspace.id, 'Activity Project', 'ACT');
      await insertProjectMember(p1, workspace.id, ownerId, 'admin');
      await insertProjectMember(p1, workspace.id, userActiveId, 'contributor');
      await insertProjectMember(p1, workspace.id, userDeactivatedId, 'contributor');
      await insertProjectMember(p1, workspace.id, wsMemberDeactivatedId, 'contributor');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', adminCookie)
        .expect(200);

      const members = res.body.projects[0].members as { userId: string; accountActive: boolean }[];
      const memberIds = members.map((m) => m.userId);

      expect(memberIds).toContain(userActiveId);
      expect(memberIds).toContain(userDeactivatedId);
      // Inactive workspace member is excluded:
      expect(memberIds).not.toContain(wsMemberDeactivatedId);

      const deactivatedEntry = members.find((m) => m.userId === userDeactivatedId);
      expect(deactivatedEntry?.accountActive).toBe(false);

      const activeEntry = members.find((m) => m.userId === userActiveId);
      expect(activeEntry?.accountActive).toBe(true);
    });

    it('AC-13: email is omitted from JSON for viewer without email.view, included for viewer with permission', async () => {
      const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
        'ws-ac13@openplany.dev',
        'ac13-ws',
      );
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

    it('AC-14: user lacking project.members.view sees members: null', async () => {
      const { workspace } = await seedWorkspace('ws-ac14@openplany.dev', 'ac14-ws');
      const guestId = await createUser('guest-ac14@openplany.dev');
      const guestCookie = await signInCookie('guest-ac14@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest');

      const p1 = await insertProject(workspace.id, 'Secret Members Project', 'SMP');
      // Assign guest role to the guest user in the project
      await insertProjectMember(p1, workspace.id, guestId, 'guest');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', guestCookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.projects[0].members).toBeNull();
    });
  });
});
