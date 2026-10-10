import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser as createE2eUser,
  signInCookie as signInE2eCookie,
  DEFAULT_E2E_ORIGIN,
  DEFAULT_E2E_PASSWORD,
} from './helpers/e2eUsers.js';

const ORIGIN = DEFAULT_E2E_ORIGIN;
const PASSWORD = DEFAULT_E2E_PASSWORD;

describe('WorkspaceMembers (e2e)', () => {
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
  ) => createE2eUser(e2e, email, { is_superuser: true, ...opts });

  const signInCookie = (email: string) =>
    signInE2eCookie(e2e, email, PASSWORD, ORIGIN);

  async function seedWorkspace(ownerEmail: string, slug: string) {
    const ownerId = await createUser(ownerEmail);
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

  it('DB B7: column joined_at exists, is NOT NULL, and defaults to now()', async () => {
    const columns = await e2e.dataSource.query<
      { column_name: string; is_nullable: string; column_default: string }[]
    >(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_name = 'workspace_members' AND column_name = 'joined_at'`,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0]!.is_nullable).toBe('NO');
    expect(columns[0]!.column_default).toContain('now()');
  });

  it('1. AC-02: permissions check for GET /members by role and membership', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin@openplany.dev',
      'wm-auth-test',
    );

    // Create member, guest, outsider, instance admin outsider
    const memberId = await createUser('member@openplany.dev', {
      is_superuser: false,
    });
    const memberCookie = await signInCookie('member@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    const guestId = await createUser('guest@openplany.dev', {
      is_superuser: false,
    });
    const guestCookie = await signInCookie('guest@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'guest', now(), now(), now())`,
      [workspace.id, guestId],
    );

    await createUser('outsider@openplany.dev', { is_superuser: false });
    const outsiderCookie = await signInCookie('outsider@openplany.dev');

    await createUser('superuser-outsider@openplany.dev', { is_superuser: true });
    const superuserOutsiderCookie = await signInCookie(
      'superuser-outsider@openplany.dev',
    );

    // Admin: 200
    await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Member: 200
    await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', memberCookie)
      .expect(200);

    // Guest: 403
    await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', guestCookie)
      .expect(403);

    // Outsider: 404
    await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', outsiderCookie)
      .expect(404);

    // Instance admin not in workspace: 404
    await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', superuserOutsiderCookie)
      .expect(404);
  });

  it('2. AC-03: email visibility and dynamic role_permissions update', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-email@openplany.dev',
      'wm-email-test',
    );

    const memberId = await createUser('member-email@openplany.dev', {
      is_superuser: false,
    });
    const memberCookie = await signInCookie('member-email@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    // Member calling: no element has 'email' key
    const memberRes = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', memberCookie)
      .expect(200);

    for (const m of memberRes.body.members) {
      expect(m).not.toHaveProperty('email');
      expect('email' in m).toBe(false);
    }

    // Admin calling: all members have 'email' key
    const adminRes = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .expect(200);

    for (const m of adminRes.body.members) {
      expect(m).toHaveProperty('email');
      expect(typeof m.email).toBe('string');
    }

    // Grant workspace.members.email.view to Member in DB
    await e2e.dataSource.query(
      `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
       VALUES ('workspace', 'member', 'workspace.members.email.view', now())`,
    );

    // Member now sees email
    const memberWithEmailRes = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', memberCookie)
      .expect(200);

    for (const m of memberWithEmailRes.body.members) {
      expect(m).toHaveProperty('email');
      expect(typeof m.email).toBe('string');
    }
  });

  it('3. AC-04: includes deactivated accounts, excludes former members, total matches memberCount', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-active@openplany.dev',
      'wm-active-test',
    );

    // Active member
    const activeMemberId = await createUser('active-m@openplany.dev', {
      is_superuser: false,
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, activeMemberId],
    );

    // Deactivated user account
    const deactivatedId = await createUser('deactivated@openplany.dev', {
      is_superuser: false,
      is_active: false,
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, deactivatedId],
    );

    // Former member (is_active = false on workspace_members)
    const formerId = await createUser('former@openplany.dev', {
      is_superuser: false,
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', false, now(), now(), now())`,
      [workspace.id, formerId],
    );

    const res = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .expect(200);

    // Check deactivated account is present with accountActive = false
    const deactMember = res.body.members.find(
      (m: { userId: string }) => m.userId === deactivatedId,
    );
    expect(deactMember).toBeDefined();
    expect(deactMember.accountActive).toBe(false);

    // Check former member is NOT present
    const formerMember = res.body.members.find(
      (m: { userId: string }) => m.userId === formerId,
    );
    expect(formerMember).toBeUndefined();

    // Total matches workspace.memberCount (which is 3: admin + activeMember + deactivated)
    expect(res.body.total).toBe(3);
    const wsRes = await http()
      .get(`/api/workspaces/${workspace.slug}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(wsRes.body.memberCount).toBe(3);
  });

  it('13. API-22: GET /members includes Cache-Control: no-store', async () => {
    const { workspace, cookie } = await seedWorkspace(
      'admin-cache@openplany.dev',
      'wm-cache-test',
    );

    const res = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', cookie)
      .expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('DB-F6: users without first/last name are sorted by display_name', async () => {
    const { workspace, cookie } = await seedWorkspace(
      'admin-sort@openplany.dev',
      'wm-sort-test',
    );

    // User A: no names, display_name = 'Aaa User'
    const userA = await createUser('user-a@openplany.dev', {
      is_superuser: false,
      first: '',
      last: '',
      display: 'Aaa User',
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, userA],
    );

    // User Z: no names, display_name = 'Zzz User'
    const userZ = await createUser('user-z@openplany.dev', {
      is_superuser: false,
      first: '',
      last: '',
      display: 'Zzz User',
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, userZ],
    );

    const res = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', cookie)
      .expect(200);

    const members = res.body.members as { userId: string }[];
    const idxA = members.findIndex((m) => m.userId === userA);
    const idxZ = members.findIndex((m) => m.userId === userZ);

    expect(idxA).toBeGreaterThan(-1);
    expect(idxZ).toBeGreaterThan(-1);
    expect(idxA).toBeLessThan(idxZ);
  });
});

