import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MEMBER_MESSAGES } from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser as createE2eUser,
  DEFAULT_E2E_ORIGIN,
  DEFAULT_E2E_PASSWORD,
  signInCookie as signInE2eCookie,
} from './helpers/e2eUsers.js';

const ORIGIN = DEFAULT_E2E_ORIGIN;
const PASSWORD = DEFAULT_E2E_PASSWORD;

describe('ProjectMembers (e2e)', () => {
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
    email: string,
    opts: { is_superuser?: boolean; is_active?: boolean } = {},
  ) => createE2eUser(e2e, email, { is_superuser: opts.is_superuser ?? true, is_active: opts.is_active ?? true });

  const signInCookie = (email: string) =>
    signInE2eCookie(e2e, email, PASSWORD, ORIGIN);

  async function seedWorkspace(email: string, slug: string) {
    const ownerId = await createUser(email, { is_superuser: true });
    const cookie = await signInCookie(email);
    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Workspace ' + slug,
        slug,
        organizationSize: '2-10',
      })
      .expect(201);
    return { workspace: res.body as { id: string; slug: string }, ownerId, cookie };
  }

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

  async function addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: 'admin' | 'member' | 'guest',
    isActive = true,
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, now(), now(), now())`,
      [workspaceId, userId, role, isActive],
    );
  }

  async function addProjectMember(
    projectId: string,
    workspaceId: string,
    userId: string,
    role: 'admin' | 'contributor' | 'commenter' | 'guest',
    isActive = true,
  ) {
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [projectId, workspaceId, userId, role, isActive],
    );
  }

  describe('GET /api/workspaces/:slug/projects/:identifier/members', () => {
    it('returns 401 UNAUTHENTICATED without session cookie', async () => {
      const { workspace } = await seedWorkspace('owner-401@openplany.dev', 'ws-401');
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/TEST/members`)
        .expect(401);
    });

    it('returns 404 NOT_FOUND when requesting nonexistent workspace or non-member', async () => {
      await createUser('outsider@openplany.dev', { is_superuser: false });
      const cookie = await signInCookie('outsider@openplany.dev');
      await http()
        .get('/api/workspaces/nonexistent/projects/TEST/members')
        .set('Cookie', cookie)
        .expect(404);
    });

    it('returns 404 PROJECT_NOT_FOUND when project does not exist', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-proj-404@openplany.dev',
        'ws-proj-404',
      );
      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/NONEX/members`)
        .set('Cookie', cookie)
        .expect(404);
      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    });

    it('AC-06: returns 403 FORBIDDEN when user lacks project.members.view', async () => {
      const { workspace } = await seedWorkspace('owner-403@openplany.dev', 'ws-403');
      const projId = await createProject(workspace.id, 'P403', 'P403');

      // Member of workspace, but not member of project
      const memberId = await createUser('member-not-in-proj@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, memberId, 'member');
      const memberCookie = await signInCookie('member-not-in-proj@openplany.dev');

      const res1 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P403/members`)
        .set('Cookie', memberCookie)
        .expect(403);
      expect(res1.body.code).toBe('FORBIDDEN');

      // Guest in project (only has project.settings.view, lacks project.members.view)
      const guestId = await createUser('guest-in-proj@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, guestId, 'guest');
      await addProjectMember(projId, workspace.id, guestId, 'guest');
      const guestCookie = await signInCookie('guest-in-proj@openplany.dev');

      const res2 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P403/members`)
        .set('Cookie', guestCookie)
        .expect(403);
      expect(res2.body.code).toBe('FORBIDDEN');
    });

    it('AC-04: Workspace Admin sees all project members including email', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'ws-admin-viewer@openplany.dev',
        'ws-admin-v',
      );
      const projId = await createProject(workspace.id, 'Project A', 'PA');

      const m1 = await createUser('m1@openplany.dev', { is_superuser: false });
      await addWorkspaceMember(workspace.id, m1, 'member');
      await addProjectMember(projId, workspace.id, m1, 'contributor');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PA/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({
        userId: m1,
        role: 'contributor',
        assignedRole: 'contributor',
        roleLimited: false,
        email: 'm1@openplany.dev',
        accountActive: true,
      });
      expect(res.body.truncated).toBe(false);
      // Workspace admin has project.members.manage
      expect(res.body.addableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
        'guest',
      ]);
    });

    it('AC-38: Member viewer without workspace.members.email.view does not see email in JSON', async () => {
      const { workspace } = await seedWorkspace(
        'owner-noemail@openplany.dev',
        'ws-noemail',
      );
      const projId = await createProject(workspace.id, 'Project B', 'PB');

      // Member viewer (has project.members.view via contributor, but workspace member lacks email.view)
      const viewerId = await createUser('viewer-noemail@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, viewerId, 'member');
      await addProjectMember(projId, workspace.id, viewerId, 'contributor');
      const viewerCookie = await signInCookie('viewer-noemail@openplany.dev');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PB/members`)
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].email).toBeUndefined();
      expect(res.body.members[0].userId).toBe(viewerId);
    });

    it('AC-02: former workspace member (is_active=false) is excluded from members and total', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-former@openplany.dev',
        'ws-former',
      );
      const projId = await createProject(workspace.id, 'Project C', 'PC');

      const activeMemberId = await createUser('active-m@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, activeMemberId, 'member', true);
      await addProjectMember(projId, workspace.id, activeMemberId, 'contributor', true);

      const formerMemberId = await createUser('former-m@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, formerMemberId, 'member', false);
      await addProjectMember(projId, workspace.id, formerMemberId, 'contributor', true);

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].userId).toBe(activeMemberId);
    });

    it('AC-05: viewer without project.members.manage receives addableRoles: []', async () => {
      const { workspace } = await seedWorkspace(
        'owner-addable@openplany.dev',
        'ws-addable',
      );
      const projId = await createProject(workspace.id, 'Project D', 'PD');

      const viewerId = await createUser('contrib-viewer@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, viewerId, 'member');
      // contributor has project.members.view but lacks project.members.manage
      await addProjectMember(projId, workspace.id, viewerId, 'contributor');
      const viewerCookie = await signInCookie('contrib-viewer@openplany.dev');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PD/members`)
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(res.body.addableRoles).toEqual([]);
    });

    it('AC-27: member clamped by workspace ceiling has effective role and roleLimited true', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-clamped@openplany.dev',
        'ws-clamped',
      );
      const projId = await createProject(workspace.id, 'Project E', 'PE');

      // Guest in workspace with contributor assigned role in project
      const guestMemberId = await createUser('guest-clamped@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, guestMemberId, 'guest');
      await addProjectMember(projId, workspace.id, guestMemberId, 'contributor');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PE/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({
        userId: guestMemberId,
        role: 'guest',
        assignedRole: 'contributor',
        roleLimited: true,
      });
    });

    it('AC-28: deactivated user account shows accountActive false', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-deact@openplany.dev',
        'ws-deact',
      );
      const projId = await createProject(workspace.id, 'Project F', 'PF');

      const deactUserId = await createUser('deactivated-u@openplany.dev', {
        is_superuser: false,
        is_active: false,
      });
      await addWorkspaceMember(workspace.id, deactUserId, 'member');
      await addProjectMember(projId, workspace.id, deactUserId, 'contributor');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PF/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0]).toMatchObject({
        userId: deactUserId,
        accountActive: false,
      });
    });

    it('ignores unknown query parameters and returns 200', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-query@openplany.dev',
        'ws-query',
      );
      await createProject(workspace.id, 'Project G', 'PG');

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PG/members?foo=1&bar=baz`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.members).toEqual([]);
    });
  });

  describe('GET /api/workspaces/:slug/projects/:identifier/member-candidates', () => {
    it('Row 1: rejects missing, empty, or short email (< 3 chars) with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand1@openplany.dev',
        'ws-cand1',
      );
      await createProject(workspace.id, 'Project C1', 'PC1');

      for (const query of ['', '?email=']) {
        await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PC1/member-candidates${query}`)
          .set('Cookie', cookie)
          .expect(400);
      }

      const resAb = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC1/member-candidates?email=ab`)
        .set('Cookie', cookie)
        .expect(400);

      expect(JSON.stringify(resAb.body)).toContain(MEMBER_MESSAGES.candidateQueryTooShort);
    });

    it('Row 2 & 3: rejects array query and email longer than 254 chars with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand2@openplany.dev',
        'ws-cand2',
      );
      await createProject(workspace.id, 'Project C2', 'PC2');

      // array query
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC2/member-candidates?email[]=a&email[]=b`)
        .set('Cookie', cookie)
        .expect(400);

      // 255 chars (EMAIL_MAX is 254)
      const longEmail = 'a'.repeat(246) + '@test.com'; // length 246 + 9 = 255
      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC2/member-candidates?email=${longEmail}`)
        .set('Cookie', cookie)
        .expect(400);
    });

    it('Row 4: rejects null bytes and control chars with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand3@openplany.dev',
        'ws-cand3',
      );
      await createProject(workspace.id, 'Project C3', 'PC3');

      for (const q of ['an%00b', 'an%07b']) {
        const res = await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PC3/member-candidates?email=${q}`)
          .set('Cookie', cookie)
          .expect(400);

        expect(JSON.stringify(res.body)).toContain(MEMBER_MESSAGES.candidateQueryInvalid);
      }
    });

    it('Row 13: rejects unknown query parameters with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand4@openplany.dev',
        'ws-cand4',
      );
      await createProject(workspace.id, 'Project C4', 'PC4');

      await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC4/member-candidates?email=an@openplany.dev&foo=1`)
        .set('Cookie', cookie)
        .expect(400);
    });

    it('Row 5, 10 & AC-10: contains mode escapes special chars and limits to 10 candidates', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'kai-owner@openplany.dev',
        'ws-kai',
      );
      const projId = await createProject(workspace.id, 'Project Kai', 'PKAI');

      // Create 12 users with similar emails
      for (let i = 1; i <= 12; i++) {
        const uid = await createUser(`testuser${i}@openplany.dev`, { is_superuser: false });
        await addWorkspaceMember(workspace.id, uid, 'member');
        if (i === 1) {
          // make user 1 an existing project member
          await addProjectMember(projId, workspace.id, uid, 'contributor');
        }
      }

      // Escape test: % and _ should not match every user
      const escapeRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=%25@%25`)
        .set('Cookie', cookie)
        .expect(200);
      expect(escapeRes.body.candidates).toHaveLength(0);

      // Search 'testuser' matches 12 users, but limit is 10
      const limitRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=testuser`)
        .set('Cookie', cookie)
        .expect(200);

      expect(limitRes.body.candidates).toHaveLength(10);

      // Verify statuses
      const candidate1 = limitRes.body.candidates.find(
        (c: { email: string }) => c.email === 'testuser1@openplany.dev',
      );
      expect(candidate1).toBeDefined();
      expect(candidate1.status).toBe('already_member');
      expect(candidate1.addableRoles).toEqual([]);

      const candidate2 = limitRes.body.candidates.find(
        (c: { email: string }) => c.email === 'testuser2@openplany.dev',
      );
      expect(candidate2).toBeDefined();
      expect(candidate2.status).toBe('addable');
      expect(candidate2.addableRoles).toEqual(['admin', 'contributor', 'commenter', 'guest']);

      // Workspace admin candidate
      const wsAdminRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=kai-owner`)
        .set('Cookie', cookie)
        .expect(200);
      expect(wsAdminRes.body.candidates[0].status).toBe('workspace_admin');
      expect(wsAdminRes.body.candidates[0].addableRoles).toEqual([]);
    });

    it('Row 6, 7, 8, 9 & AC-42: exact mode requires full email match and does not reveal other emails', async () => {
      const { workspace } = await seedWorkspace(
        'owner-nam@openplany.dev',
        'ws-nam',
      );
      const projId = await createProject(workspace.id, 'Project Nam', 'PNAM');

      // Create Nam as Project Admin (Workspace Member, lacks email.view)
      const namId = await createUser('nam@openplany.dev', { is_superuser: false });
      await addWorkspaceMember(workspace.id, namId, 'member');
      await addProjectMember(projId, workspace.id, namId, 'admin');
      const namCookie = await signInCookie('nam@openplany.dev');

      // Create An
      const anId = await createUser('an@openplany.dev', { is_superuser: false });
      await addWorkspaceMember(workspace.id, anId, 'member');

      // Create CLI member admin@localhost
      const cliId = await createUser('admin@localhost', { is_superuser: false });
      await addWorkspaceMember(workspace.id, cliId, 'member');

      // Create Tu (user not in workspace)
      await createUser('tu@outside.dev', { is_superuser: false });

      // Row 6: partial email 'an@' returns [] in exact mode
      const resPartial = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=an@`)
        .set('Cookie', namCookie)
        .expect(200);
      expect(resPartial.body.candidates).toEqual([]);

      // Row 7: uppercase email returns An with lowercase email
      const resUpper = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=AN@OPENPLANY.DEV`)
        .set('Cookie', namCookie)
        .expect(200);
      expect(resUpper.body.candidates).toHaveLength(1);
      expect(resUpper.body.candidates[0]).toMatchObject({
        userId: anId,
        email: 'an@openplany.dev',
        status: 'addable',
      });

      // Row 8: user outside workspace returns []
      const resTu = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=tu@outside.dev`)
        .set('Cookie', namCookie)
        .expect(200);
      expect(resTu.body.candidates).toEqual([]);

      // Row 9 & AC-42: CLI member admin@localhost is found
      const resCli = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=admin@localhost`)
        .set('Cookie', namCookie)
        .expect(200);
      expect(resCli.body.candidates).toHaveLength(1);
      expect(resCli.body.candidates[0]).toMatchObject({
        userId: cliId,
        email: 'admin@localhost',
      });
    });

    it('Row 11: returns 429 when rate limit of 60 searches per minute is exceeded', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-ratelimit@openplany.dev',
        'ws-rl',
      );
      await createProject(workspace.id, 'Project RL', 'PRL');

      for (let i = 0; i < 60; i++) {
        await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PRL/member-candidates?email=test${i % 5}@test.com`)
          .set('Cookie', cookie)
          .expect(200);
      }

      // 61st search should return 429
      const res429 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PRL/member-candidates?email=test0@test.com`)
        .set('Cookie', cookie)
        .expect(429);

      expect(res429.body.message).toContain(MEMBER_MESSAGES.tooManySearches);
    });

    it('Row 12 & AC-40: unauthorized caller gets 403 and attempts still count towards rate limit', async () => {
      const { workspace } = await seedWorkspace(
        'owner-unauth@openplany.dev',
        'ws-unauth',
      );
      const projId = await createProject(workspace.id, 'Project Unauth', 'PUNAU');

      const contribId = await createUser('contrib-caller@openplany.dev', { is_superuser: false });
      await addWorkspaceMember(workspace.id, contribId, 'member');
      // Contributor lacks project.members.manage
      await addProjectMember(projId, workspace.id, contribId, 'contributor');
      const contribCookie = await signInCookie('contrib-caller@openplany.dev');

      // First 60 calls get 403
      for (let i = 0; i < 60; i++) {
        await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PUNAU/member-candidates?email=an@test.com`)
          .set('Cookie', contribCookie)
          .expect(403);
      }

      // 61st call returns 429 because rate limiter runs before permission guard! (AC-40)
      const res61 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PUNAU/member-candidates?email=an@test.com`)
        .set('Cookie', contribCookie)
        .expect(429);

      expect(res61.body.message).toContain(MEMBER_MESSAGES.tooManySearches);
    });
  });
});

