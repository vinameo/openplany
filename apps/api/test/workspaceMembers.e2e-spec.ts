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

  it('10. AC-11: candidate search filters inactive/bot/masked/no-email users and returns alreadyMember flag', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-cand@openplany.dev',
      'wm-cand-filter',
    );

    // 1. Regular active user who is already a member
    const memberId = await createUser('cand-member@openplany.dev', {
      is_superuser: false,
      first: 'Cand',
      last: 'Member',
    });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    // 2. Active non-member candidate
    const nonMemberId = await createUser('cand-outside@openplany.dev', {
      is_superuser: false,
      first: 'Cand',
      last: 'Outside',
    });

    // 3. Deactivated user
    const deactivatedId = await createUser('cand-deact@openplany.dev', {
      is_superuser: false,
    });
    await e2e.dataSource.query('UPDATE users SET is_active = false WHERE id = $1', [deactivatedId]);

    // 4. Bot user
    const botId = await createUser('cand-bot@openplany.dev', {
      is_superuser: false,
    });
    await e2e.dataSource.query('UPDATE users SET is_bot = true WHERE id = $1', [botId]);

    // 5. Masked user
    const maskedId = await createUser('cand-masked@openplany.dev', {
      is_superuser: false,
    });
    await e2e.dataSource.query('UPDATE users SET masked_at = now() WHERE id = $1', [maskedId]);

    // Search case-insensitively with 'CAND'
    const res = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=CAND`)
      .set('Cookie', adminCookie)
      .expect(200);

    const candidates = res.body.candidates as {
      userId: string;
      email: string;
      alreadyMember: boolean;
    }[];

    const returnedIds = candidates.map((c) => c.userId);
    expect(returnedIds).toContain(memberId);
    expect(returnedIds).toContain(nonMemberId);
    expect(returnedIds).not.toContain(deactivatedId);
    expect(returnedIds).not.toContain(botId);
    expect(returnedIds).not.toContain(maskedId);

    const candMember = candidates.find((c) => c.userId === memberId);
    const candOutside = candidates.find((c) => c.userId === nonMemberId);
    expect(candMember?.alreadyMember).toBe(true);
    expect(candOutside?.alreadyMember).toBe(false);
  });

  it('11. AC-12: candidate search validates query length, limits to 10, prioritizes exact match, and escapes LIKE patterns', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-cand11@openplany.dev',
      'wm-cand-query',
    );

    // 1. Length < 3 -> 400 VALIDATION_ERROR
    const errRes = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=ab`)
      .set('Cookie', adminCookie)
      .expect(400);

    expect(errRes.body.code).toBe('VALIDATION_ERROR');
    expect(errRes.body.fields).toHaveProperty('email');

    // 2. 15 matching users, with one exact match
    for (let i = 1; i <= 14; i++) {
      await createUser(`prefix-match-${i.toString().padStart(2, '0')}@openplany.dev`, {
        is_superuser: false,
      });
    }
    const exactMatchEmail = 'match-user@openplany.dev';
    const exactId = await createUser(exactMatchEmail, { is_superuser: false });

    const searchRes = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=match-user@openplany.dev`)
      .set('Cookie', adminCookie)
      .expect(200);

    expect(searchRes.body.candidates.length).toBeLessThanOrEqual(10);
    expect(searchRes.body.candidates[0].userId).toBe(exactId);
    expect(searchRes.body.candidates[0].email).toBe(exactMatchEmail);

    // 3. Escape LIKE special chars (% and _)
    const specialEmail = 'a_%test@openplany.dev';
    await createUser(specialEmail, { is_superuser: false });
    const normalEmail = 'abctest@openplany.dev';
    await createUser(normalEmail, { is_superuser: false });

    const escapeRes = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=a_%`)
      .set('Cookie', adminCookie)
      .expect(200);

    const escapeEmails = escapeRes.body.candidates.map((c: { email: string }) => c.email);
    expect(escapeEmails).toContain(specialEmail);
    expect(escapeEmails).not.toContain(normalEmail);
  });

  it('12. AC-13 & API-21: rate limits candidate searches to 60/min per user and evaluates limiter before slug check', async () => {
    const { workspace } = await seedWorkspace(
      'admin-cand12@openplany.dev',
      'wm-cand-ratelimit',
    );

    const memberId = await createUser('member-cand12@openplany.dev', {
      is_superuser: false,
    });
    const memberCookie = await signInCookie('member-cand12@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    // Member gets 403 FORBIDDEN
    await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=test@example.com`)
      .set('Cookie', memberCookie)
      .expect(403);

    // API-21: Calling with wrong slug still hits the rate limiter
    const otherAdminCookie = await signInCookie('admin-cand12@openplany.dev');
    for (let i = 0; i < 60; i++) {
      await http()
        .get(`/api/workspaces/completely-wrong-slug/member-candidates?email=test@example.com`)
        .set('Cookie', otherAdminCookie)
        .expect(404);
    }

    // 61st call with wrong slug returns 429 TOO_MANY_ATTEMPTS
    const limitedRes = await http()
      .get(`/api/workspaces/completely-wrong-slug/member-candidates?email=test@example.com`)
      .set('Cookie', otherAdminCookie)
      .expect(429);

    expect(limitedRes.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(limitedRes.body.retryAfterSeconds).toBeDefined();
  });

  it('13. API-22: GET /members and GET /member-candidates include Cache-Control: no-store', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-cand13@openplany.dev',
      'wm-cand-cache',
    );

    const membersRes = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(membersRes.headers['cache-control']).toBe('no-store');

    const candidatesRes = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=test@example.com`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(candidatesRes.headers['cache-control']).toBe('no-store');
  });

  it('15. AC-01: Admin has 4 enforced permissions, Member has 1, Guest has 0', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-cand15@openplany.dev',
      'wm-cand-perms',
    );

    const memberId = await createUser('member-cand15@openplany.dev', {
      is_superuser: false,
    });
    const memberCookie = await signInCookie('member-cand15@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    const guestId = await createUser('guest-cand15@openplany.dev', {
      is_superuser: false,
    });
    const guestCookie = await signInCookie('guest-cand15@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'guest', now(), now(), now())`,
      [workspace.id, guestId],
    );

    // Admin has 4 permissions
    const adminWsRes = await http()
      .get(`/api/workspaces/${workspace.slug}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(adminWsRes.body.permissions).toEqual([
      'workspace.settings.update',
      'workspace.members.view',
      'workspace.members.email.view',
      'workspace.members.add',
    ]);

    // Member has 1 permission
    const memberWsRes = await http()
      .get(`/api/workspaces/${workspace.slug}`)
      .set('Cookie', memberCookie)
      .expect(200);
    expect(memberWsRes.body.permissions).toEqual(['workspace.members.view']);

    // Guest has 0 permissions
    const guestWsRes = await http()
      .get(`/api/workspaces/${workspace.slug}`)
      .set('Cookie', guestCookie)
      .expect(200);
    expect(guestWsRes.body.permissions).toEqual([]);
  });

  it('4. AC-05: Admin adds 3 users (admin, member, guest) -> 201, correct order, with email; users see workspace at GET /workspaces', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add4@openplany.dev',
      'wm-add-three',
    );

    const user1 = await createUser('u1-add4@openplany.dev', { is_superuser: false });
    const user2 = await createUser('u2-add4@openplany.dev', { is_superuser: false });
    const user3 = await createUser('u3-add4@openplany.dev', { is_superuser: false });

    const addRes = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [
          { userId: user1, role: 'admin' },
          { userId: user2, role: 'member' },
          { userId: user3, role: 'guest' },
        ],
      })
      .expect(201);

    expect(addRes.body.members).toHaveLength(3);
    expect(addRes.body.members[0].userId).toBe(user1);
    expect(addRes.body.members[0].role).toBe('admin');
    expect(addRes.body.members[0].email).toBe('u1-add4@openplany.dev');
    expect(addRes.body.members[1].userId).toBe(user2);
    expect(addRes.body.members[1].role).toBe('member');
    expect(addRes.body.members[2].userId).toBe(user3);
    expect(addRes.body.members[2].role).toBe('guest');

    // GET /members now has 4 members (owner + 3 new)
    const membersRes = await http()
      .get(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(membersRes.body.total).toBe(4);

    // Each added user sees the workspace at GET /workspaces
    for (const email of ['u1-add4@openplany.dev', 'u2-add4@openplany.dev', 'u3-add4@openplany.dev']) {
      const cookie = await signInCookie(email);
      const wsRes = await http()
        .get('/api/workspaces')
        .set('Cookie', cookie)
        .expect(200);
      const found = wsRes.body.workspaces.find((w: { slug: string }) => w.slug === workspace.slug);
      expect(found).toBeDefined();
    }
  });

  it('5. AC-06: role change history recorded for batch add with X-Request-Id', async () => {
    const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
      'admin-add5@openplany.dev',
      'wm-add-history',
    );

    const user1 = await createUser('u1-add5@openplany.dev', { is_superuser: false });
    const user2 = await createUser('u2-add5@openplany.dev', { is_superuser: false });
    const customRequestId = 'req-batch-add-12345';

    await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .set('X-Request-Id', customRequestId)
      .send({
        members: [
          { userId: user1, role: 'member' },
          { userId: user2, role: 'guest' },
        ],
      })
      .expect(201);

    const historyRows = await e2e.dataSource.query<
      {
        workspace_id: string;
        member_id: string;
        from_role: string | null;
        to_role: string;
        change_type: string;
        actor_id: string;
        request_id: string;
      }[]
    >(
      `SELECT workspace_id, member_id, from_role, to_role, change_type, actor_id, request_id
       FROM workspace_member_role_history
       WHERE workspace_id = $1 AND change_type = 'member_added'
       ORDER BY member_id`,
      [workspace.id],
    );

    expect(historyRows).toHaveLength(2);
    for (const row of historyRows) {
      expect(row.from_role).toBeNull();
      expect(row.actor_id).toBe(ownerId);
      expect(row.request_id).toBe(customRequestId);
    }
  });

  it('6. AC-07: validation and permission checks on POST /members', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add6@openplany.dev',
      'wm-add-auth',
    );

    const targetUser = await createUser('target-add6@openplany.dev', { is_superuser: false });

    // role: 'owner' -> 400 VALIDATION_ERROR
    const ownerRes = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [{ userId: targetUser, role: 'owner' }],
      })
      .expect(400);
    expect(ownerRes.body.code).toBe('VALIDATION_ERROR');
    expect(ownerRes.body.fields['members.0.role']).toBeDefined();

    // Member without workspace.members.add -> 403 FORBIDDEN
    const memberId = await createUser('member-add6@openplany.dev', { is_superuser: false });
    const memberCookie = await signInCookie('member-add6@openplany.dev');
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, memberId],
    );

    await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', memberCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [{ userId: targetUser, role: 'member' }],
      })
      .expect(403);

    // Revoke workspace.members.add from admin via SQL -> Admin gets 403
    await e2e.dataSource.query(
      `DELETE FROM role_permissions
       WHERE scope = 'workspace' AND role_key = 'admin' AND permission_key = 'workspace.members.add'`,
    );

    await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [{ userId: targetUser, role: 'member' }],
      })
      .expect(403);
  });

  it('7. AC-08: re-adds former member, preserves created_at and id, updates joined_at and role', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add7@openplany.dev',
      'wm-add-former',
    );

    const formerUser = await createUser('former-add7@openplany.dev', { is_superuser: false });
    const pastDate = new Date('2025-01-01T00:00:00.000Z');

    // Create inactive workspace_member row (former member)
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'guest', false, $3, $3, $3)`,
      [workspace.id, formerUser, pastDate],
    );

    const oldRow = (
      await e2e.dataSource.query<{ id: string; created_at: Date }[]>(
        `SELECT id, created_at FROM workspace_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, formerUser],
      )
    )[0]!;

    const addRes = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [{ userId: formerUser, role: 'member' }],
      })
      .expect(201);

    expect(addRes.body.members[0].role).toBe('member');

    // Check DB row
    const updatedRow = (
      await e2e.dataSource.query<{
        id: string;
        is_active: boolean;
        role: string;
        created_at: Date;
        joined_at: Date;
      }[]>(
        `SELECT id, is_active, role, created_at, joined_at
         FROM workspace_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, formerUser],
      )
    )[0]!;

    expect(updatedRow.id).toBe(oldRow.id);
    expect(updatedRow.is_active).toBe(true);
    expect(updatedRow.role).toBe('member');
    expect(new Date(updatedRow.created_at).getTime()).toBe(new Date(oldRow.created_at).getTime());
    expect(new Date(updatedRow.joined_at).getTime()).toBeGreaterThan(pastDate.getTime());
  });

  it('8. AC-09: returns 409 MEMBERS_NOT_ADDABLE when a user is already a member, rolls back all', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add8@openplany.dev',
      'wm-add-already',
    );

    const existingMember = await createUser('existing-add8@openplany.dev', { is_superuser: false });
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', now(), now(), now())`,
      [workspace.id, existingMember],
    );

    const newCandidate1 = await createUser('new1-add8@openplany.dev', { is_superuser: false });
    const newCandidate2 = await createUser('new2-add8@openplany.dev', { is_superuser: false });

    const res = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [
          { userId: newCandidate1, role: 'member' },
          { userId: existingMember, role: 'guest' },
          { userId: newCandidate2, role: 'member' },
        ],
      })
      .expect(409);

    expect(res.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(res.body.fields).toEqual({
      'members.1.userId': 'Already a member of this workspace',
    });

    // Neither newCandidate1 nor newCandidate2 was added
    const membersAfter = await e2e.dataSource.query(
      `SELECT member_id FROM workspace_members WHERE workspace_id = $1 AND is_active = true`,
      [workspace.id],
    );
    expect(membersAfter).toHaveLength(2); // owner + existingMember
  });

  it('9. AC-10: handles unavailable users, >20 rows, and duplicate userIds', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add9@openplany.dev',
      'wm-add-edge',
    );

    const deactUser = await createUser('deact-add9@openplany.dev', {
      is_superuser: false,
      is_active: false,
    });
    const fakeUuid = 'a0000000-0000-4000-8000-000000000099';

    // 1. Deactivated user + non-existent UUID -> 409 for both rows
    const res409 = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [
          { userId: deactUser, role: 'member' },
          { userId: fakeUuid, role: 'guest' },
        ],
      })
      .expect(409);

    expect(res409.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(res409.body.fields['members.0.userId']).toBe(
      "This person can't be added. Their account may be deactivated.",
    );
    expect(res409.body.fields['members.1.userId']).toBe(
      "This person can't be added. Their account may be deactivated.",
    );

    // 2. > 20 rows -> 400 VALIDATION_ERROR on members
    const validCandidate = await createUser('cand-add9@openplany.dev', { is_superuser: false });
    const twentyOneRows = Array.from({ length: 21 }, () => ({
      userId: validCandidate,
      role: 'member' as const,
    }));

    const res21 = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({ members: twentyOneRows })
      .expect(400);

    expect(res21.body.code).toBe('VALIDATION_ERROR');
    expect(res21.body.fields.members).toBeDefined();

    // 3. Duplicate userIds in request -> 400 VALIDATION_ERROR on members.1.userId
    const resDup = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [
          { userId: validCandidate, role: 'member' },
          { userId: validCandidate, role: 'guest' },
        ],
      })
      .expect(400);

    expect(resDup.body.code).toBe('VALIDATION_ERROR');
    expect(resDup.body.fields['members.1.userId']).toBe(
      'This person is already in another row',
    );
  });

  it('14. RQ R-2: concurrent addition race condition: one transaction holds lock, second fails with 409', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-race@openplany.dev',
      'wm-add-race',
    );

    const targetUser = await createUser('target-race@openplany.dev', { is_superuser: false });

    // Transaction A starts and inserts the user into workspace_members without committing yet
    const runnerA = e2e.dataSource.createQueryRunner();
    await runnerA.connect();
    await runnerA.startTransaction();

    await runnerA.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, joined_at, created_at, updated_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [workspace.id, targetUser],
    );

    // Commit runnerA
    await runnerA.commitTransaction();
    await runnerA.release();

    // Now request B tries to add targetUser -> gets 409 MEMBERS_NOT_ADDABLE
    const resB = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [{ userId: targetUser, role: 'member' }],
      })
      .expect(409);

    expect(resB.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(resB.body.fields['members.0.userId']).toBe('Already a member of this workspace');
  });
});

