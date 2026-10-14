import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import { MEMBER_MESSAGES } from '@repo/contracts';
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

    // 4. AC-41: Control characters (e.g. NUL) return 400 with validation message
    const ctrlRes = await http()
      .get(`/api/workspaces/${workspace.slug}/member-candidates?email=an%00b`)
      .set('Cookie', adminCookie)
      .expect(400);

    expect(ctrlRes.body.code).toBe('VALIDATION_ERROR');
    expect(ctrlRes.body.fields).toHaveProperty(
      'email',
      'Remove special characters from the email',
    );
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
      'workspace.members.role.update',
      'workspace.projects.create',
      'workspace.projects.delete',
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

  it('4b. adds an uppercase userId under its canonical id and treats two cases of one id as duplicates', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-add4b@openplany.dev',
      'wm-add-upper',
    );
    const userId = await createUser('u1-add4b@openplany.dev', { is_superuser: false });

    const dupRes = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({
        members: [
          { userId, role: 'member' },
          { userId: userId.toUpperCase(), role: 'guest' },
        ],
      })
      .expect(400);
    expect(dupRes.body.fields?.['members.1.userId']).toBe(MEMBER_MESSAGES.rowDuplicate);

    const addRes = await http()
      .post(`/api/workspaces/${workspace.slug}/members`)
      .set('Cookie', adminCookie)
      .set('Origin', ORIGIN)
      .send({ members: [{ userId: userId.toUpperCase(), role: 'member' }] })
      .expect(201);
    expect(addRes.body.members).toHaveLength(1);
    expect(addRes.body.members[0].userId).toBe(userId);
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

  it('14b. RQ R-2: add blocked by an uncommitted insert of the same person returns 409 after it commits', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-race2@openplany.dev',
      'wm-add-race2',
    );
    const targetUser = await createUser('target-race2@openplany.dev', { is_superuser: false });

    const runnerA = e2e.dataSource.createQueryRunner();
    await runnerA.connect();
    await runnerA.startTransaction();
    try {
      await runnerA.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, joined_at, created_at, updated_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, targetUser],
      );

      // B waits on the unique index until A commits, then hits the violation and retries.
      const pendingB = http()
        .post(`/api/workspaces/${workspace.slug}/members`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ members: [{ userId: targetUser, role: 'member' }] })
        .then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await runnerA.commitTransaction();

      const resB = await pendingB;
      expect(resB.status).toBe(409);
      expect(resB.body.fields['members.0.userId']).toBe('Already a member of this workspace');
    } finally {
      if (runnerA.isTransactionActive) await runnerA.rollbackTransaction();
      await runnerA.release();
    }
  });

  it('14c. RQ R-2: two concurrent batches with the same people in opposite order never fail with 500', async () => {
    const { workspace, cookie: adminCookie } = await seedWorkspace(
      'admin-race3@openplany.dev',
      'wm-add-race3',
    );
    const userA = await createUser('race3-a@openplany.dev', { is_superuser: false });
    const userB = await createUser('race3-b@openplany.dev', { is_superuser: false });

    const add = (ids: string[]) =>
      http()
        .post(`/api/workspaces/${workspace.slug}/members`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ members: ids.map((userId) => ({ userId, role: 'member' })) })
        .then((res) => res);

    const responses = await Promise.all([add([userA, userB]), add([userB, userA])]);

    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const rows = await e2e.dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id = $1 AND is_active`,
      [workspace.id],
    );
    expect(rows[0]!.count).toBe(3);
  });

  describe('change role', () => {
    async function createProject(
      workspaceId: string,
      name: string,
      identifier: string,
    ) {
      const [project] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
         VALUES ($1, $2, $3, 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
        [workspaceId, name, identifier],
      );
      return project!.id;
    }

    async function addProjectMember(
      projectId: string,
      workspaceId: string,
      userId: string,
      role: 'admin' | 'contributor' | 'commenter' | 'viewer',
      isActive = true,
    ) {
      await e2e.dataSource.query(
        `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
        [projectId, workspaceId, userId, role, isActive],
      );
    }

    it('15. AC-01: Guest in 3 projects -> Workspace Admin changes to Member, chooses Contributor', async () => {
      const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
        'admin-ac01@openplany.dev',
        'wm-ac01',
      );
      const p1 = await createProject(workspace.id, 'Project 1', 'PR1');
      const p2 = await createProject(workspace.id, 'Project 2', 'PR2');
      const p3 = await createProject(workspace.id, 'Project 3', 'PR3');

      const myId = await createUser('my-ac01@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, myId],
      );

      await addProjectMember(p1, workspace.id, myId, 'viewer');
      await addProjectMember(p2, workspace.id, myId, 'viewer');
      await addProjectMember(p3, workspace.id, myId, 'viewer');

      // GET preview
      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${myId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.effect).toBe('apply_project_role');
      expect(previewRes.body.fromRole).toBe('guest');
      expect(previewRes.body.toRole).toBe('member');
      expect(previewRes.body.affectedProjects.total).toBe(3);
      expect(previewRes.body.actorCanChooseProjectRole).toBe(true);
      expect(previewRes.body.projectRoleChoices).toEqual(['admin', 'contributor', 'commenter']);
      expect(previewRes.body.defaultProjectRole).toBe('commenter');

      // PATCH
      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${myId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
          projectRole: 'contributor',
        })
        .expect(200);

      expect(patchRes.body.member.role).toBe('member');
      expect(patchRes.body.appliedProjectCount).toBe(3);

      // Verify workspace_members row
      const wmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM workspace_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(wmRows[0]!.role).toBe('member');

      // Verify all 3 project_members rows
      const pmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(pmRows).toHaveLength(3);
      expect(pmRows.every((r) => r.role === 'contributor')).toBe(true);

      // Verify 1 workspace_member_role_history row
      const wmHistory = await e2e.dataSource.query<{ change_type: string; from_role: string; to_role: string; actor_id: string }[]>(
        `SELECT change_type, from_role, to_role, actor_id FROM workspace_member_role_history WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(wmHistory).toHaveLength(1);
      expect(wmHistory[0]!.change_type).toBe('role_changed');
      expect(wmHistory[0]!.from_role).toBe('guest');
      expect(wmHistory[0]!.to_role).toBe('member');
      expect(wmHistory[0]!.actor_id).toBe(ownerId);

      // Verify 3 project_member_role_history rows
      const pmHistory = await e2e.dataSource.query<{ change_type: string; from_role: string; to_role: string; actor_id: string }[]>(
        `SELECT change_type, from_role, to_role, actor_id FROM project_member_role_history WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(pmHistory).toHaveLength(3);
      expect(pmHistory.every((r) => r.change_type === 'workspace_role_applied')).toBe(true);
      expect(pmHistory.every((r) => r.from_role === 'viewer')).toBe(true);
      expect(pmHistory.every((r) => r.to_role === 'contributor')).toBe(true);
      expect(pmHistory.every((r) => r.actor_id === ownerId)).toBe(true);
    });

    it('16. AC-02: Member in 2 projects -> change to Guest -> both rows become viewer', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac02@openplany.dev',
        'wm-ac02',
      );
      const p1 = await createProject(workspace.id, 'Alpha', 'ALP');
      const p2 = await createProject(workspace.id, 'Beta', 'BET');

      const namId = await createUser('nam-ac02@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, namId],
      );

      await addProjectMember(p1, workspace.id, namId, 'admin');
      await addProjectMember(p2, workspace.id, namId, 'commenter');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${namId}/role-change-preview?role=guest`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.effect).toBe('apply_project_role');
      expect(previewRes.body.projectRoleChoices).toEqual(['viewer']);
      expect(previewRes.body.defaultProjectRole).toBe('viewer');

      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${namId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'member',
          role: 'guest',
          projectRole: 'viewer',
        })
        .expect(200);

      expect(patchRes.body.member.role).toBe('guest');
      expect(patchRes.body.appliedProjectCount).toBe(2);

      const pmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, namId],
      );
      expect(pmRows).toHaveLength(2);
      expect(pmRows.every((r) => r.role === 'viewer')).toBe(true);
    });

    it('17. AC-05: Target is actor -> 403 roleNotAllowed', async () => {
      const { workspace, ownerId, cookie: adminCookie } = await seedWorkspace(
        'admin-ac05@openplany.dev',
        'wm-ac05',
      );

      const res = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${ownerId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'admin',
          role: 'member',
        })
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe(MEMBER_MESSAGES.roleNotAllowed);
    });

    it('18. AC-06: Member with workspace.members.role.update cannot modify an Admin or assign admin', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'admin-ac06@openplany.dev',
        'wm-ac06',
      );
      const memberId = await createUser('member-ac06@openplany.dev', { is_superuser: false });
      const memberCookie = await signInCookie('member-ac06@openplany.dev');

      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, memberId],
      );

      // Grant workspace.members.role.update to workspace role 'member'
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
         VALUES ('workspace', 'member', 'workspace.members.role.update', now())`,
      );

      // Member tries to modify Admin owner
      const res1 = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${ownerId}`)
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'admin',
          role: 'member',
        })
        .expect(403);
      expect(res1.body.code).toBe('FORBIDDEN');

      // Member tries to promote a guest to admin
      const guestId = await createUser('guest-ac06@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, guestId],
      );

      const res2 = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${guestId}`)
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'admin',
        })
        .expect(403);
      expect(res2.body.code).toBe('FORBIDDEN');
    });

    it('19. AC-07: Same role -> 400 ROLE_UNCHANGED; fromRole mismatch -> 409 ROLE_CHANGED', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac07@openplany.dev',
        'wm-ac07',
      );
      const targetId = await createUser('target-ac07@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetId],
      );

      // Same role
      const resSame = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'guest',
        })
        .expect(400);
      expect(resSame.body.code).toBe('ROLE_UNCHANGED');
      expect(resSame.body.message).toBe(MEMBER_MESSAGES.sameRole);

      // fromRole mismatch
      const resMismatch = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'member',
          role: 'admin',
        })
        .expect(409);
      expect(resMismatch.body.code).toBe('ROLE_CHANGED');
      expect(resMismatch.body.message).toBe(MEMBER_MESSAGES.roleChanged);
    });

    it('20. AC-12: Preview target, then 4th project added, save applies to 4 projects', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac12@openplany.dev',
        'wm-ac12',
      );
      const p1 = await createProject(workspace.id, 'P1', 'PR1');
      const p2 = await createProject(workspace.id, 'P2', 'PR2');
      const p3 = await createProject(workspace.id, 'P3', 'PR3');

      const targetId = await createUser('target-ac12@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetId],
      );
      await addProjectMember(p1, workspace.id, targetId, 'viewer');
      await addProjectMember(p2, workspace.id, targetId, 'viewer');
      await addProjectMember(p3, workspace.id, targetId, 'viewer');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(previewRes.body.affectedProjects.total).toBe(3);

      // Now add 4th project
      const p4 = await createProject(workspace.id, 'P4', 'PR4');
      await addProjectMember(p4, workspace.id, targetId, 'viewer');

      // Save
      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
          projectRole: 'contributor',
        })
        .expect(200);

      expect(patchRes.body.appliedProjectCount).toBe(4);
      const pmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, targetId],
      );
      expect(pmRows).toHaveLength(4);
      expect(pmRows.every((r) => r.role === 'contributor')).toBe(true);
    });

    it('21. AC-23: Concurrent identical change requests -> one 200, one 409 ROLE_CHANGED', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac23@openplany.dev',
        'wm-ac23',
      );
      const targetId = await createUser('target-ac23@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetId],
      );

      const changeReq = () =>
        http()
          .patch(`/api/workspaces/${workspace.slug}/members/${targetId}`)
          .set('Cookie', adminCookie)
          .set('Origin', ORIGIN)
          .send({
            fromRole: 'guest',
            role: 'member',
          });

      const [resA, resB] = await Promise.all([changeReq(), changeReq()]);
      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);
      const conflictRes = resA.status === 409 ? resA : resB;
      expect(conflictRes.body.code).toBe('ROLE_CHANGED');
    });

    it('22. AC-25: Preview no_projects, added to project, save without projectRole gets bottom role', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac25@openplany.dev',
        'wm-ac25',
      );
      const targetId = await createUser('target-ac25@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetId],
      );

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);
      expect(previewRes.body.effect).toBe('no_projects');
      expect(previewRes.body.affectedProjects.total).toBe(0);

      // Now add to project P
      const p = await createProject(workspace.id, 'ProjP', 'PRP');
      await addProjectMember(p, workspace.id, targetId, 'viewer');

      // Save without projectRole
      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
        })
        .expect(200);

      expect(patchRes.body.appliedProjectCount).toBe(1);
      const pmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, targetId],
      );
      expect(pmRows[0]!.role).toBe('commenter');
    });

    it('23. AC-28 / D21: Preview rate limit permits 60 calls then returns 429 on 61st', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac28@openplany.dev',
        'wm-ac28',
      );
      const targetId = await createUser('target-ac28@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetId],
      );

      for (let i = 0; i < 60; i++) {
        await http()
          .get(`/api/workspaces/${workspace.slug}/members/${targetId}/role-change-preview?role=member`)
          .set('Cookie', adminCookie)
          .expect(200);
      }

      const res61 = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(429);

      expect(res61.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(res61.body.retryAfterSeconds).toBeDefined();
    });

    it('24. AC-03: Promote Member to Workspace Admin (gain_implicit) deactivates project members, records history with to_role=null, gains implicit access', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac03@openplany.dev',
        'wm-ac03',
      );
      const p1 = await createProject(workspace.id, 'Project 1', 'P1A03');
      const p2 = await createProject(workspace.id, 'Project 2', 'P2A03');

      const namId = await createUser('nam-ac03@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, namId],
      );
      await addProjectMember(p1, workspace.id, namId, 'contributor');
      await addProjectMember(p2, workspace.id, namId, 'commenter');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${namId}/role-change-preview?role=admin`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.effect).toBe('gain_implicit');
      expect(previewRes.body.affectedProjects.total).toBe(2);
      expect(previewRes.body.actorCanChooseProjectRole).toBe(true);
      expect(previewRes.body.defaultProjectRole).toBeNull();
      expect(previewRes.body.projectRoleChoices).toEqual([]);

      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${namId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'member',
          role: 'admin',
        })
        .expect(200);

      expect(patchRes.body.effect).toBe('gain_implicit');
      expect(patchRes.body.appliedProjectCount).toBe(2);
      expect(patchRes.body.member.role).toBe('admin');

      // Verify DB: project_members deactivated
      const pmRows = await e2e.dataSource.query<{ is_active: boolean }[]>(
        `SELECT is_active FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, namId],
      );
      expect(pmRows).toHaveLength(2);
      expect(pmRows.every((r) => !r.is_active)).toBe(true);

      // Verify project role history recorded with to_role = null
      const pmHistories = await e2e.dataSource.query<{ to_role: string | null; change_type: string }[]>(
        `SELECT to_role, change_type FROM project_member_role_history WHERE workspace_id = $1 AND member_id = $2 ORDER BY created_at ASC`,
        [workspace.id, namId],
      );
      expect(pmHistories).toHaveLength(2);
      expect(pmHistories[0]!.to_role).toBeNull();
      expect(pmHistories[0]!.change_type).toBe('workspace_role_applied');

      // Verify Nam has implicit Project Admin access to projects
      const namCookie = await signInCookie('nam-ac03@openplany.dev');
      const projRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P1A03`)
        .set('Cookie', namCookie)
        .expect(200);
      expect(projRes.body.project.id).toBe(p1);
    });

    it('25. AC-04: Demote Workspace Admin to Member (lose_implicit), 7 active projects and 1 deleted project, target loses access', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac04@openplany.dev',
        'wm-ac04',
      );

      // 7 active projects
      for (let i = 1; i <= 7; i++) {
        await createProject(workspace.id, `Proj ${i}`, `P040${i}`);
      }
      // 1 soft-deleted project
      await e2e.dataSource.query(
        `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone, deleted_at)
         VALUES ($1, 'Deleted Proj', 'P04DL', 'square-check', '#868E96', 'cover-01', 'UTC', now()) RETURNING id`,
        [workspace.id],
      );

      const lanId = await createUser('lan-ac04@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'admin', true, now(), now(), now())`,
        [workspace.id, lanId],
      );

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${lanId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.effect).toBe('lose_implicit');
      expect(previewRes.body.affectedProjects.total).toBe(7);

      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${lanId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'admin',
          role: 'member',
        })
        .expect(200);

      expect(patchRes.body.effect).toBe('lose_implicit');
      expect(patchRes.body.appliedProjectCount).toBe(0);
      expect(patchRes.body.member.role).toBe('member');

      // Verify Lan loses project access (no explicit project membership)
      const lanCookie = await signInCookie('lan-ac04@openplany.dev');
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P0401`)
        .set('Cookie', lanCookie)
        .expect(403);
    });

    it('26. AC-10: Two Admins demoting each other simultaneously -> exactly one succeeds, one fails with 403, 1 admin remains', async () => {
      const { workspace, ownerId, cookie: adminACookie } = await seedWorkspace(
        'admin-a-ac10@openplany.dev',
        'wm-ac10',
      );
      const adminBId = await createUser('admin-b-ac10@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'admin', true, now(), now(), now())`,
        [workspace.id, adminBId],
      );
      const adminBCookie = await signInCookie('admin-b-ac10@openplany.dev');

      const aDemotesB = () =>
        http()
          .patch(`/api/workspaces/${workspace.slug}/members/${adminBId}`)
          .set('Cookie', adminACookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'admin', role: 'member' });

      const bDemotesA = () =>
        http()
          .patch(`/api/workspaces/${workspace.slug}/members/${ownerId}`)
          .set('Cookie', adminBCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'admin', role: 'member' });

      const [resA, resB] = await Promise.all([aDemotesB(), bDemotesA()]);
      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 403]);

      const forbiddenRes = resA.status === 403 ? resA : resB;
      expect(forbiddenRes.body.code).toBe('FORBIDDEN');

      // Exactly 1 admin remains active
      const adminCountRows = await e2e.dataSource.query<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id = $1 AND role = 'admin' AND is_active`,
        [workspace.id],
      );
      expect(adminCountRows[0]!.count).toBe(1);
    });

    it('27. AC-24: 20 parallel executions of PATCH member role and POST project members never 5xx or deadlock', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac24@openplany.dev',
        'wm-ac24',
      );
      await createProject(workspace.id, 'Project AC24', 'PAC24');

      const myId = await createUser('my-ac24@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, myId],
      );

      const operations = Array.from({ length: 20 }, (_, i) => {
        if (i % 2 === 0) {
          return http()
            .patch(`/api/workspaces/${workspace.slug}/members/${myId}`)
            .set('Cookie', adminCookie)
            .set('Origin', ORIGIN)
            .send({
              fromRole: i % 4 === 0 ? 'member' : 'guest',
              role: i % 4 === 0 ? 'guest' : 'member',
            });
        } else {
          return http()
            .post(`/api/workspaces/${workspace.slug}/projects/PAC24/members`)
            .set('Cookie', adminCookie)
            .set('Origin', ORIGIN)
            .send({
              members: [{ userId: myId, role: 'viewer' }],
            });
        }
      });

      const results = await Promise.all(operations);
      for (const res of results) {
        expect(res.status).toBeLessThan(500);
      }
    });

    it('28. AC-08: Member with role.update upgrades Guest in 2 projects -> cannot choose project admin, locks to commenter', async () => {
      const { workspace } = await seedWorkspace(
        'admin-ac08@openplany.dev',
        'wm-ac08',
      );
      // Give workspace role 'member' the permission 'workspace.members.role.update'
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
         VALUES ('workspace', 'member', 'workspace.members.role.update', now())
         ON CONFLICT (scope, role_key, permission_key) DO NOTHING`,
      );

      const p1 = await createProject(workspace.id, 'Project 1', 'P1A08');
      const p2 = await createProject(workspace.id, 'Project 2', 'P2A08');

      const actorXId = await createUser('x-ac08@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, actorXId],
      );
      const actorXCookie = await signInCookie('x-ac08@openplany.dev');

      const targetYId = await createUser('y-ac08@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetYId],
      );
      await addProjectMember(p1, workspace.id, targetYId, 'viewer');
      await addProjectMember(p2, workspace.id, targetYId, 'viewer');

      // Actor X previews Guest Y -> Member
      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetYId}/role-change-preview?role=member`)
        .set('Cookie', actorXCookie)
        .expect(200);

      expect(previewRes.body.actorCanChooseProjectRole).toBe(false);
      expect(previewRes.body.projectRoleChoices).toEqual(['commenter']);
      expect(previewRes.body.defaultProjectRole).toBe('commenter');

      // X sends custom projectRole 'admin' -> 403
      await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetYId}`)
        .set('Cookie', actorXCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
          projectRole: 'admin',
        })
        .expect(403);

      // X sends without projectRole -> 200, both rows become commenter
      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${targetYId}`)
        .set('Cookie', actorXCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
        })
        .expect(200);

      expect(patchRes.body.member.role).toBe('member');
      expect(patchRes.body.appliedProjectCount).toBe(2);

      const pmRows = await e2e.dataSource.query<{ role: string }[]>(
        `SELECT role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, targetYId],
      );
      expect(pmRows).toHaveLength(2);
      expect(pmRows.every((r) => r.role === 'commenter')).toBe(true);
    });

    it('29. AC-13: Actor X views preview of Y, Y in 3 projects and X can only access 1 -> total=3, hiddenCount=2', async () => {
      const { workspace } = await seedWorkspace(
        'admin-ac13@openplany.dev',
        'wm-ac13',
      );
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
         VALUES ('workspace', 'member', 'workspace.members.role.update', now())
         ON CONFLICT (scope, role_key, permission_key) DO NOTHING`,
      );

      const p1 = await createProject(workspace.id, 'Alpha Project', 'P1A13');
      const p2 = await createProject(workspace.id, 'Beta Project', 'P2A13');
      const p3 = await createProject(workspace.id, 'Gamma Project', 'P3A13');

      const actorXId = await createUser('x-ac13@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, actorXId],
      );
      // X is only a member of p1
      await addProjectMember(p1, workspace.id, actorXId, 'contributor');
      const actorXCookie = await signInCookie('x-ac13@openplany.dev');

      const targetYId = await createUser('y-ac13@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, targetYId],
      );
      // Y is a member of p1, p2, p3
      await addProjectMember(p1, workspace.id, targetYId, 'contributor');
      await addProjectMember(p2, workspace.id, targetYId, 'contributor');
      await addProjectMember(p3, workspace.id, targetYId, 'contributor');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetYId}/role-change-preview?role=guest`)
        .set('Cookie', actorXCookie)
        .expect(200);

      expect(previewRes.body.affectedProjects.total).toBe(3);
      expect(previewRes.body.affectedProjects.hiddenCount).toBe(2);
      expect(previewRes.body.affectedProjects.projects).toHaveLength(1);
      expect(previewRes.body.affectedProjects.projects[0]!.id).toBe(p1);
    });

    it('30. AC-14: Target Y in 25 projects, actor has access to all -> 10 names returned, total=25, hiddenCount=0', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac14@openplany.dev',
        'wm-ac14',
      );
      const targetYId = await createUser('y-ac14@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, targetYId],
      );

      for (let i = 1; i <= 25; i++) {
        const ident = `P${String(i).padStart(2, '0')}14`;
        const pid = await createProject(workspace.id, `Proj ${i}`, ident);
        await addProjectMember(pid, workspace.id, targetYId, 'viewer');
      }

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${targetYId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.affectedProjects.total).toBe(25);
      expect(previewRes.body.affectedProjects.hiddenCount).toBe(0);
      expect(previewRes.body.affectedProjects.projects).toHaveLength(10);
    });

    it('31. AC-15: Target is sole active assigned Project Admin -> projectsLosingAssignedAdmin includes project; locked co-admin not counted', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac15@openplany.dev',
        'wm-ac15',
      );
      const pB = await createProject(workspace.id, 'Project Beta', 'PB15');

      const namId = await createUser('nam-ac15@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, namId],
      );
      await addProjectMember(pB, workspace.id, namId, 'admin');

      // Add a co-admin Z with locked user account (is_active = false)
      const lockedZId = await createUser('z-locked@openplany.dev', { is_superuser: false, is_active: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, lockedZId],
      );
      await addProjectMember(pB, workspace.id, lockedZId, 'admin');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${namId}/role-change-preview?role=guest`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.projectsLosingAssignedAdmin.total).toBe(1);
      expect(previewRes.body.projectsLosingAssignedAdmin.projects[0]!.id).toBe(pB);
    });

    it('31b. AC-15: Target with a locked account and an active co-admin -> project not listed (count excludes the target, not 1)', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac15b@openplany.dev',
        'wm-ac15b',
      );
      const pB = await createProject(workspace.id, 'Project Beta', 'PB15B');

      const lockedTargetId = await createUser('target-locked@openplany.dev', {
        is_superuser: false,
        is_active: false,
      });
      const coAdminId = await createUser('co-admin-ac15b@openplany.dev', {
        is_superuser: false,
      });
      for (const id of [lockedTargetId, coAdminId]) {
        await e2e.dataSource.query(
          `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
           VALUES ($1, $2, 'member', true, now(), now(), now())`,
          [workspace.id, id],
        );
        await addProjectMember(pB, workspace.id, id, 'admin');
      }

      const previewRes = await http()
        .get(
          `/api/workspaces/${workspace.slug}/members/${lockedTargetId}/role-change-preview?role=guest`,
        )
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.projectsLosingAssignedAdmin.total).toBe(0);
    });

    it('32. AC-26: Target in 2 projects, 1 soft-deleted -> preview total=1, save updates both, appliedProjectCount=1, 1 history record', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac26@openplany.dev',
        'wm-ac26',
      );
      const pActive = await createProject(workspace.id, 'Active Proj', 'P1A26');
      const [pDeleted] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone, deleted_at)
         VALUES ($1, 'Deleted Proj', 'PD26', 'square-check', '#868E96', 'cover-01', 'UTC', now()) RETURNING id`,
        [workspace.id],
      );

      const myId = await createUser('my-ac26@openplany.dev', { is_superuser: false });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'guest', true, now(), now(), now())`,
        [workspace.id, myId],
      );
      await addProjectMember(pActive, workspace.id, myId, 'viewer');
      await addProjectMember(pDeleted!.id, workspace.id, myId, 'viewer');

      const previewRes = await http()
        .get(`/api/workspaces/${workspace.slug}/members/${myId}/role-change-preview?role=member`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(previewRes.body.affectedProjects.total).toBe(1);
      expect(previewRes.body.affectedProjects.projects[0]!.id).toBe(pActive);

      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${myId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'guest',
          role: 'member',
          projectRole: 'contributor',
        })
        .expect(200);

      expect(patchRes.body.appliedProjectCount).toBe(1);

      // In DB: both project memberships updated to contributor
      const pmRows = await e2e.dataSource.query<{ project_id: string; role: string }[]>(
        `SELECT project_id, role FROM project_members WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(pmRows).toHaveLength(2);
      expect(pmRows.every((r) => r.role === 'contributor')).toBe(true);

      // Only 1 project role history record (for the active project)
      const histories = await e2e.dataSource.query<{ project_id: string }[]>(
        `SELECT project_id FROM project_member_role_history WHERE workspace_id = $1 AND member_id = $2`,
        [workspace.id, myId],
      );
      expect(histories).toHaveLength(1);
      expect(histories[0]!.project_id).toBe(pActive);
    });

    it('33. AC-27: Target has locked account (is_active = false) -> role change succeeds with 200', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace(
        'admin-ac27@openplany.dev',
        'wm-ac27',
      );
      const lockedId = await createUser('locked-ac27@openplany.dev', {
        is_superuser: false,
        is_active: false,
      });
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, 'member', true, now(), now(), now())`,
        [workspace.id, lockedId],
      );

      const patchRes = await http()
        .patch(`/api/workspaces/${workspace.slug}/members/${lockedId}`)
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({
          fromRole: 'member',
          role: 'guest',
        })
        .expect(200);

      expect(patchRes.body.member.role).toBe('guest');
    });
  });
});

