import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Logger } from '@nestjs/common';
import {
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
  PROJECT_ROLE_CHANGE_MESSAGES,
  type ProjectListItem,
  type ProjectMemberResponse,
} from '@repo/contracts';
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
  ) =>
    createE2eUser(e2e, email, {
      is_superuser: opts.is_superuser ?? true,
      is_active: opts.is_active ?? true,
    });

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
    return {
      workspace: res.body as { id: string; slug: string },
      ownerId,
      cookie,
    };
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
    role: 'admin' | 'contributor' | 'commenter' | 'viewer',
    isActive = true,
  ) {
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [projectId, workspaceId, userId, role, isActive],
    );
  }

  async function seedB63Fixture() {
    const { workspace, ownerId } = await seedWorkspace(
      'owner-b63@openplany.dev',
      'ws-b63',
    );
    const projId = await createProject(workspace.id, 'Project B63', 'PB63');

    const kaiId = await createUser('kai-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, kaiId, 'admin');
    await addProjectMember(projId, workspace.id, kaiId, 'admin');
    const kaiCookie = await signInCookie('kai-b63@openplany.dev');

    const namId = await createUser('nam-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, namId, 'member');
    await addProjectMember(projId, workspace.id, namId, 'admin');
    const namCookie = await signInCookie('nam-b63@openplany.dev');

    const hoaId = await createUser('hoa-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, hoaId, 'member');
    await addProjectMember(projId, workspace.id, hoaId, 'contributor');

    const lanId = await createUser('lan-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, lanId, 'admin');

    const dungId = await createUser('dung-b63@openplany.dev', {
      is_superuser: false,
      is_active: false,
    });
    await addWorkspaceMember(workspace.id, dungId, 'member');

    const binhId = await createUser('binh-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, binhId, 'guest');

    const tuId = await createUser('tu-b63@openplany.dev', {
      is_superuser: false,
    });

    const anId = await createUser('an-b63@openplany.dev', {
      is_superuser: false,
    });
    await addWorkspaceMember(workspace.id, anId, 'member');

    return {
      workspace,
      ownerId,
      projId,
      kaiId,
      kaiCookie,
      namId,
      namCookie,
      hoaId,
      lanId,
      dungId,
      binhId,
      tuId,
      anId,
    };
  }

  describe('GET /api/workspaces/:slug/projects/:identifier/members', () => {
    it('returns 401 UNAUTHENTICATED without session cookie', async () => {
      const { workspace } = await seedWorkspace(
        'owner-401@openplany.dev',
        'ws-401',
      );
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
      const { workspace } = await seedWorkspace(
        'owner-403@openplany.dev',
        'ws-403',
      );
      const projId = await createProject(workspace.id, 'P403', 'P403');

      // Member of workspace, but not member of project
      const memberId = await createUser('member-not-in-proj@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, memberId, 'member');
      const memberCookie = await signInCookie(
        'member-not-in-proj@openplany.dev',
      );

      const res1 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P403/members`)
        .set('Cookie', memberCookie)
        .expect(403);
      expect(res1.body.code).toBe('FORBIDDEN');

      // Viewer in project (only has project.settings.view, lacks project.members.view)
      const guestId = await createUser('guest-in-proj@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, guestId, 'guest');
      await addProjectMember(projId, workspace.id, guestId, 'viewer');
      const guestCookie = await signInCookie('guest-in-proj@openplany.dev');

      const res2 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/P403/members`)
        .set('Cookie', guestCookie)
        .expect(403);
      expect(res2.body.code).toBe('FORBIDDEN');
    });

    it('AC-04: Workspace Admin sees all project members including email', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
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
      expect(res.body.members).toHaveLength(2);
      const m1Member = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === m1,
      );
      expect(m1Member).toMatchObject({
        userId: m1,
        role: 'contributor',
        assignedRole: 'contributor',
        roleLimited: false,
        email: 'm1@openplany.dev',
        accountActive: true,
      });
      const ownerMember = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === ownerId,
      );
      expect(ownerMember).toMatchObject({
        userId: ownerId,
        role: 'admin',
        assignedRole: null,
        source: 'inherited',
        workspaceRole: 'admin',
        email: 'ws-admin-viewer@openplany.dev',
      });
      expect(res.body.truncated).toBe(false);
      // Workspace admin has project.members.manage
      expect(res.body.addableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
        'viewer',
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

      expect(res.body.members).toHaveLength(2);
      const viewerMember = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === viewerId,
      );
      expect(viewerMember?.email).toBeUndefined();
      expect(viewerMember?.userId).toBe(viewerId);
      expect(
        res.body.members.every(
          (m: ProjectMemberResponse) => m.email === undefined,
        ),
      ).toBe(true);
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
      await addProjectMember(
        projId,
        workspace.id,
        activeMemberId,
        'contributor',
        true,
      );

      const formerMemberId = await createUser('former-m@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, formerMemberId, 'member', false);
      await addProjectMember(
        projId,
        workspace.id,
        formerMemberId,
        'contributor',
        true,
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PC/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.members).toHaveLength(2);
      expect(
        res.body.members.some(
          (m: ProjectMemberResponse) => m.userId === activeMemberId,
        ),
      ).toBe(true);
      expect(
        res.body.members.some(
          (m: ProjectMemberResponse) => m.userId === formerMemberId,
        ),
      ).toBe(false);
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
      await addProjectMember(
        projId,
        workspace.id,
        guestMemberId,
        'contributor',
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PE/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.members).toHaveLength(2);
      const guest = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === guestMemberId,
      );
      expect(guest).toMatchObject({
        userId: guestMemberId,
        role: 'viewer',
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

      expect(res.body.members).toHaveLength(2);
      const deact = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === deactUserId,
      );
      expect(deact).toMatchObject({
        userId: deactUserId,
        accountActive: false,
      });
    });

    it('ignores unknown query parameters and returns 200', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-query@openplany.dev',
        'ws-query',
      );
      await createProject(workspace.id, 'Project G', 'PG');

      const res = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PG/members?foo=1&bar=baz`,
        )
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].userId).toBe(ownerId);
    });

    it('returns assignableRoles and assignedAdminCount (excluding deactivated users)', async () => {
      const {
        workspace,
        ownerId,
        cookie: wsAdminCookie,
      } = await seedWorkspace('owner-roles@openplany.dev', 'ws-roles');
      const projId = await createProject(
        workspace.id,
        'Project Roles',
        'PROLE',
      );

      // Member 1: Active Project Admin
      const m1 = await createUser('m1-admin@openplany.dev', {
        is_superuser: false,
        is_active: true,
      });
      await addWorkspaceMember(workspace.id, m1, 'member');
      await addProjectMember(projId, workspace.id, m1, 'admin');

      // Member 2: Deactivated Project Admin (should NOT count in assignedAdminCount)
      const m2 = await createUser('m2-deact@openplany.dev', {
        is_superuser: false,
        is_active: false,
      });
      await addWorkspaceMember(workspace.id, m2, 'member');
      await addProjectMember(projId, workspace.id, m2, 'admin');

      // Member 3: Contributor
      const m3 = await createUser('m3-contrib@openplany.dev', {
        is_superuser: false,
        is_active: true,
      });
      await addWorkspaceMember(workspace.id, m3, 'member');
      await addProjectMember(projId, workspace.id, m3, 'contributor');

      // Member 4: Another Project Admin (actor)
      const m4 = await createUser('m4-actor@openplany.dev', {
        is_superuser: false,
        is_active: true,
      });
      await addWorkspaceMember(workspace.id, m4, 'member');
      await addProjectMember(projId, workspace.id, m4, 'admin');
      const m4Cookie = await signInCookie('m4-actor@openplany.dev');

      // 1. Fetch as Member 4 (Project Admin, Member workspace)
      const resM4 = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PROLE/members`)
        .set('Cookie', m4Cookie)
        .expect(200);

      // assignedAdminCount: m1 and m4 are active assigned admins -> count = 2 (m2 deactivated, owner is inherited)
      expect(resM4.body.assignedAdminCount).toBe(2);

      const m4Self = resM4.body.members.find(
        (m: ProjectMemberResponse) => m.userId === m4,
      );
      const m1Peer = resM4.body.members.find(
        (m: ProjectMemberResponse) => m.userId === m1,
      );
      const m3Sub = resM4.body.members.find(
        (m: ProjectMemberResponse) => m.userId === m3,
      );
      const ownerInherited = resM4.body.members.find(
        (m: ProjectMemberResponse) => m.userId === ownerId,
      );

      // Self row has []
      expect(m4Self.assignableRoles).toEqual([]);
      // Peer Project Admin has [] (actor is member workspace, target rank >= actor rank)
      expect(m1Peer.assignableRoles).toEqual([]);
      // Contributor has ['admin', 'contributor', 'commenter']
      expect(m3Sub.assignableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
      // Inherited has []
      expect(ownerInherited.assignableRoles).toEqual([]);

      // 2. Fetch as Workspace Admin (owner) -> has overridesProjectRank
      const resOwner = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PROLE/members`)
        .set('Cookie', wsAdminCookie)
        .expect(200);

      expect(resOwner.body.assignedAdminCount).toBe(2);
      const m1AsWsAdmin = resOwner.body.members.find(
        (m: ProjectMemberResponse) => m.userId === m1,
      );
      expect(m1AsWsAdmin.assignableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);
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
          .get(
            `/api/workspaces/${workspace.slug}/projects/PC1/member-candidates${query}`,
          )
          .set('Cookie', cookie)
          .expect(400);
      }

      const resAb = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PC1/member-candidates?email=ab`,
        )
        .set('Cookie', cookie)
        .expect(400);

      expect(JSON.stringify(resAb.body)).toContain(
        MEMBER_MESSAGES.candidateQueryTooShort,
      );
    });

    it('Row 2 & 3: rejects array query and email longer than 254 chars with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand2@openplany.dev',
        'ws-cand2',
      );
      await createProject(workspace.id, 'Project C2', 'PC2');

      // array query
      await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PC2/member-candidates?email[]=a&email[]=b`,
        )
        .set('Cookie', cookie)
        .expect(400);

      // 255 chars (EMAIL_MAX is 254)
      const longEmail = 'a'.repeat(246) + '@test.com'; // length 246 + 9 = 255
      await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PC2/member-candidates?email=${longEmail}`,
        )
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
          .get(
            `/api/workspaces/${workspace.slug}/projects/PC3/member-candidates?email=${q}`,
          )
          .set('Cookie', cookie)
          .expect(400);

        expect(JSON.stringify(res.body)).toContain(
          MEMBER_MESSAGES.candidateQueryInvalid,
        );
      }
    });

    it('Row 13: rejects unknown query parameters with 400', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-cand4@openplany.dev',
        'ws-cand4',
      );
      await createProject(workspace.id, 'Project C4', 'PC4');

      await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PC4/member-candidates?email=an@openplany.dev&foo=1`,
        )
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
        const uid = await createUser(`testuser${i}@openplany.dev`, {
          is_superuser: false,
        });
        await addWorkspaceMember(workspace.id, uid, 'member');
        if (i === 1) {
          // make user 1 an existing project member
          await addProjectMember(projId, workspace.id, uid, 'contributor');
        }
      }

      // Escape test: % and _ should not match every user
      const escapeRes = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=%25@%25`,
        )
        .set('Cookie', cookie)
        .expect(200);
      expect(escapeRes.body.candidates).toHaveLength(0);

      // Search 'testuser' matches 12 users, but limit is 10
      const limitRes = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=testuser`,
        )
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
      expect(candidate2.addableRoles).toEqual([
        'admin',
        'contributor',
        'commenter',
      ]);

      // Workspace admin candidate
      const wsAdminRes = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PKAI/member-candidates?email=kai-owner`,
        )
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
      const namId = await createUser('nam@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, namId, 'member');
      await addProjectMember(projId, workspace.id, namId, 'admin');
      const namCookie = await signInCookie('nam@openplany.dev');

      // Create An
      const anId = await createUser('an@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, anId, 'member');

      // Create CLI member admin@localhost
      const cliId = await createUser('admin@localhost', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, cliId, 'member');

      // Create Tu (user not in workspace)
      await createUser('tu@outside.dev', { is_superuser: false });

      // Row 6: partial email 'an@' returns [] in exact mode
      const resPartial = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=an@`,
        )
        .set('Cookie', namCookie)
        .expect(200);
      expect(resPartial.body.candidates).toEqual([]);

      // Row 7: uppercase email returns An with lowercase email
      const resUpper = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=AN@OPENPLANY.DEV`,
        )
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
        .get(
          `/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=tu@outside.dev`,
        )
        .set('Cookie', namCookie)
        .expect(200);
      expect(resTu.body.candidates).toEqual([]);

      // Row 9 & AC-42: CLI member admin@localhost is found
      const resCli = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PNAM/member-candidates?email=admin@localhost`,
        )
        .set('Cookie', namCookie)
        .expect(200);
      expect(resCli.body.candidates).toHaveLength(1);
      expect(resCli.body.candidates[0]).toMatchObject({
        userId: cliId,
        email: 'admin@localhost',
      });
    });

    it('AC-06: candidate suggestions reflect policy ranges (Member without viewer, Guest with viewer only)', async () => {
      const { workspace, kaiCookie } = await seedB63Fixture();
      const res = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PB63/member-candidates?email=b63@openplany.dev`,
        )
        .set('Cookie', kaiCookie)
        .expect(200);

      const an = res.body.candidates.find((c: { email: string }) =>
        c.email.includes('an-b63'),
      );
      expect(an).toBeDefined();
      expect(an.addableRoles).toEqual(['admin', 'contributor', 'commenter']);
      expect(an.addableRoles).not.toContain('viewer');
      expect(an.workspaceRole).toBe('member');

      const binh = res.body.candidates.find((c: { email: string }) =>
        c.email.includes('binh-b63'),
      );
      expect(binh).toBeDefined();
      expect(binh.addableRoles).toEqual(['viewer']);
      expect(binh.workspaceRole).toBe('guest');
    });

    it('Row 11: returns 429 when rate limit of 60 searches per minute is exceeded', async () => {
      const { workspace, cookie } = await seedWorkspace(
        'owner-ratelimit@openplany.dev',
        'ws-rl',
      );
      await createProject(workspace.id, 'Project RL', 'PRL');

      for (let i = 0; i < 60; i++) {
        await http()
          .get(
            `/api/workspaces/${workspace.slug}/projects/PRL/member-candidates?email=test${i % 5}@test.com`,
          )
          .set('Cookie', cookie)
          .expect(200);
      }

      // 61st search should return 429
      const res429 = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PRL/member-candidates?email=test0@test.com`,
        )
        .set('Cookie', cookie)
        .expect(429);

      expect(res429.body.message).toContain(MEMBER_MESSAGES.tooManySearches);
    });

    it('Row 12 & AC-40: unauthorized caller gets 403 and attempts still count towards rate limit', async () => {
      const { workspace } = await seedWorkspace(
        'owner-unauth@openplany.dev',
        'ws-unauth',
      );
      const projId = await createProject(
        workspace.id,
        'Project Unauth',
        'PUNAU',
      );

      const contribId = await createUser('contrib-caller@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, contribId, 'member');
      // Contributor lacks project.members.manage
      await addProjectMember(projId, workspace.id, contribId, 'contributor');
      const contribCookie = await signInCookie('contrib-caller@openplany.dev');

      // First 60 calls get 403
      for (let i = 0; i < 60; i++) {
        await http()
          .get(
            `/api/workspaces/${workspace.slug}/projects/PUNAU/member-candidates?email=an@test.com`,
          )
          .set('Cookie', contribCookie)
          .expect(403);
      }

      // 61st call returns 429 because rate limiter runs before permission guard! (AC-40)
      const res61 = await http()
        .get(
          `/api/workspaces/${workspace.slug}/projects/PUNAU/member-candidates?email=an@test.com`,
        )
        .set('Cookie', contribCookie)
        .expect(429);

      expect(res61.body.message).toContain(MEMBER_MESSAGES.tooManySearches);
    });
  });

  describe('POST /api/workspaces/:slug/projects/:identifier/members', () => {
    it('AC-12: adds multiple members in one batch, sets joined_at=now, creates member_added history with actorId and requestId, and returns matching memberCount', async () => {
      const { workspace } = await seedWorkspace(
        'owner-ac12@openplany.dev',
        'ws-ac12',
      );
      const projId = await createProject(workspace.id, 'Project AC12', 'PAC12');

      // Nam is Project Admin (and workspace member)
      const namId = await createUser('nam-ac12@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, namId, 'member');
      await addProjectMember(projId, workspace.id, namId, 'admin');
      const namCookie = await signInCookie('nam-ac12@openplany.dev');

      // An and Chi in workspace
      const anId = await createUser('an-ac12@openplany.dev', {
        is_superuser: false,
      });
      const chiId = await createUser('chi-ac12@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, anId, 'member');
      await addWorkspaceMember(workspace.id, chiId, 'member');

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects/PAC12/members`)
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .set('X-Request-Id', 'req-ac12-test')
        .send({
          members: [
            { userId: anId, role: 'contributor' },
            { userId: chiId, role: 'commenter' },
          ],
        })
        .expect(201);

      expect(res.body.assignedAdminCount).toBe(1);
      expect(res.body.members).toHaveLength(2);
      expect(res.body.members[0]).toMatchObject({
        userId: anId,
        role: 'contributor',
        assignedRole: 'contributor',
        assignableRoles: ['admin', 'contributor', 'commenter'],
      });
      expect(res.body.members[1]).toMatchObject({
        userId: chiId,
        role: 'commenter',
        assignedRole: 'commenter',
        assignableRoles: ['admin', 'contributor', 'commenter'],
      });

      // Verify DB project_members rows and joined_at
      const pmRows = await e2e.dataSource.query<
        {
          member_id: string;
          role: string;
          is_active: boolean;
          joined_at: string;
        }[]
      >(
        `SELECT member_id, role, is_active, joined_at FROM project_members
         WHERE project_id = $1 AND member_id IN ($2, $3)
         ORDER BY member_id ASC`,
        [projId, anId, chiId],
      );
      expect(pmRows).toHaveLength(2);
      expect(pmRows.every((r) => r.is_active)).toBe(true);

      // Verify DB history rows
      const historyRows = await e2e.dataSource.query<
        {
          member_id: string;
          from_role: string | null;
          to_role: string;
          change_type: string;
          actor_id: string;
          request_id: string;
        }[]
      >(
        `SELECT member_id, from_role, to_role, change_type, actor_id, request_id
         FROM project_member_role_history
         WHERE project_id = $1 AND change_type = 'member_added'
         ORDER BY member_id ASC`,
        [projId],
      );
      expect(historyRows).toHaveLength(2);
      for (const h of historyRows) {
        expect(h.from_role).toBeNull();
        expect(h.change_type).toBe('member_added');
        expect(h.actor_id).toBe(namId);
        expect(h.request_id).toBe('req-ac12-test');
      }

      // memberCount of project matches total of GET members (Nam + An + Chi = 3)
      const listRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PAC12/members`)
        .set('Cookie', namCookie)
        .expect(200);

      expect(listRes.body.total).toBe(3);
      expect(res.body.project.memberCount).toBe(3);
    });

    it('AC-16: reactivates inactive former member in the same row, updating role and joined_at while preserving created_at and adding one history row', async () => {
      const { workspace } = await seedWorkspace(
        'owner-ac16@openplany.dev',
        'ws-ac16',
      );
      const projId = await createProject(workspace.id, 'Project AC16', 'PAC16');

      const namId = await createUser('nam-ac16@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, namId, 'member');
      await addProjectMember(projId, workspace.id, namId, 'admin');
      const namCookie = await signInCookie('nam-ac16@openplany.dev');

      const anId = await createUser('an-ac16@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, anId, 'member');

      // Seed An as inactive former member 10 days ago
      const [oldRow] = await e2e.dataSource.query<
        { id: string; created_at: string; joined_at: string }[]
      >(
        `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, $3, 'viewer', 'project', false, now() - interval '10 days', now() - interval '10 days', now() - interval '10 days')
         RETURNING id, created_at, joined_at`,
        [projId, workspace.id, anId],
      );

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects/PAC16/members`)
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .set('X-Request-Id', 'req-ac16-reactivate')
        .send({
          members: [{ userId: anId, role: 'commenter' }],
        })
        .expect(201);

      expect(res.body.members[0]).toMatchObject({
        userId: anId,
        role: 'commenter',
      });

      // Verify same row in DB
      const [updatedRow] = await e2e.dataSource.query<
        {
          id: string;
          role: string;
          is_active: boolean;
          created_at: string;
          joined_at: string;
        }[]
      >(
        `SELECT id, role, is_active, created_at, joined_at FROM project_members
         WHERE project_id = $1 AND member_id = $2`,
        [projId, anId],
      );

      expect(updatedRow!.id).toBe(oldRow!.id);
      expect(updatedRow!.is_active).toBe(true);
      expect(updatedRow!.role).toBe('commenter');
      // created_at preserved
      expect(new Date(updatedRow!.created_at).getTime()).toBe(
        new Date(oldRow!.created_at).getTime(),
      );
      // joined_at updated to now (newer than old joined_at)
      expect(new Date(updatedRow!.joined_at).getTime()).toBeGreaterThan(
        new Date(oldRow!.joined_at).getTime(),
      );

      // 1 history row added
      const history = await e2e.dataSource.query<
        {
          to_role: string;
          change_type: string;
          actor_id: string;
          request_id: string;
        }[]
      >(
        `SELECT to_role, change_type, actor_id, request_id FROM project_member_role_history
         WHERE project_id = $1 AND member_id = $2`,
        [projId, anId],
      );
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        to_role: 'commenter',
        change_type: 'member_added',
        actor_id: namId,
        request_id: 'req-ac16-reactivate',
      });
    });

    it('AC-37: caller lacking workspace.members.email.view receives 201 without email key in members[] or project.members[]', async () => {
      const { workspace } = await seedWorkspace(
        'owner-ac37@openplany.dev',
        'ws-ac37',
      );
      const projId = await createProject(workspace.id, 'Project AC37', 'PAC37');

      // Nam is workspace member (lacks workspace.members.email.view) and project admin
      const namId = await createUser('nam-ac37@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, namId, 'member');
      await addProjectMember(projId, workspace.id, namId, 'admin');
      const namCookie = await signInCookie('nam-ac37@openplany.dev');

      const anId = await createUser('an-ac37@openplany.dev', {
        is_superuser: false,
      });
      await addWorkspaceMember(workspace.id, anId, 'member');

      const res = await http()
        .post(`/api/workspaces/${workspace.slug}/projects/PAC37/members`)
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({
          members: [{ userId: anId, role: 'contributor' }],
        })
        .expect(201);

      // members[] has no email property
      expect(res.body.members[0]).not.toHaveProperty('email');

      // project.members[] preview has no email property
      if (res.body.project.members && res.body.project.members.length > 0) {
        for (const m of res.body.project.members) {
          expect(m).not.toHaveProperty('email');
        }
      }
    });

    describe('Table B6.3: POST …/members bad input & edge cases', () => {
      it('Row 2: rejects {}, { members: null }, { members: {} }, { members: "x" } with 400', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        for (const badBody of [
          {},
          { members: null },
          { members: {} },
          { members: 'x' },
        ]) {
          await http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send(badBody)
            .expect(400);
        }
      });

      it('Row 3: rejects { members: [] } with 400 "Add at least one person"', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [] })
          .expect(400);
        expect(res.body.fields?.members).toBe(MEMBER_MESSAGES.addAtLeastOne);
      });

      it('Row 4: rejects 21 items with 400 "Add up to 20 people at a time"', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        const members = Array.from({ length: 21 }, (_, i) => ({
          userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          role: 'contributor',
        }));
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members })
          .expect(400);
        expect(res.body.fields?.members).toBe(MEMBER_MESSAGES.addAtMost);
      });

      it('Row 5: rejects invalid userId with 400 members.0.userId "Choose a person"', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        for (const badId of [
          'abc',
          123,
          null,
          '',
          'c232ab00-9414-11ec-b3c8-9f6bdecced8e',
        ]) {
          const res = await http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send({ members: [{ userId: badId, role: 'contributor' }] })
            .expect(400);
          expect(res.body.fields?.['members.0.userId']).toBe(
            MEMBER_MESSAGES.choosePerson,
          );
        }
      });

      it('Row 6: rejects invalid role with 400 members.0.role "Choose a role"', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        for (const badRole of [
          'owner',
          'guest',
          'Admin',
          'ADMIN',
          '',
          null,
          5,
        ]) {
          const res = await http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send({ members: [{ userId: anId, role: badRole }] })
            .expect(400);
          expect(res.body.fields?.['members.0.role']).toBe(
            MEMBER_MESSAGES.chooseRole,
          );
        }
      });

      it('Row 7: rejects extra fields in row or body with 400 whitelist validation', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [{ userId: anId, role: 'contributor', isActive: false }],
          })
          .expect(400);

        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [{ userId: anId, role: 'contributor' }],
            projectId: 'PB63',
          })
          .expect(400);
      });

      it('Row 8: rejects userId with NUL byte with 400', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [
              {
                userId: '00000000-0000-4000-8000-\u000000000001',
                role: 'contributor',
              },
            ],
          })
          .expect(400);
      });

      it('Row 9: rejects duplicate userId in row 0 and 2 with 400 members.2.userId', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        const dummyId = '00000000-0000-4000-8000-000000000002';
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [
              { userId: anId, role: 'contributor' },
              { userId: dummyId, role: 'commenter' },
              { userId: anId, role: 'viewer' },
            ],
          })
          .expect(400);
        expect(res.body.fields?.['members.2.userId']).toBe(
          MEMBER_MESSAGES.rowDuplicate,
        );
      });

      it('Row 9b: uppercase userId of a workspace member is added under its canonical id', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [{ userId: anId.toUpperCase(), role: 'contributor' }],
          })
          .expect(201);
        expect(res.body.members).toHaveLength(1);
        expect(res.body.members[0]).toMatchObject({
          userId: anId,
          role: 'contributor',
        });
      });

      it('Row 9c: the same userId in two cases is a duplicate row', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [
              { userId: anId, role: 'contributor' },
              { userId: anId.toUpperCase(), role: 'commenter' },
            ],
          })
          .expect(400);
        expect(res.body.fields?.['members.1.userId']).toBe(
          MEMBER_MESSAGES.rowDuplicate,
        );
      });

      it('Row 10: non-existent random UUID v4 returns 409 members.0.userId not_in_workspace', async () => {
        const { workspace, namCookie } = await seedB63Fixture();
        const nonExistentId = 'a0000000-0000-4000-8000-000000000001';
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: nonExistentId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.not_in_workspace,
        );
      });

      it('Row 11: user outside workspace (Tú) returns 409 not_in_workspace', async () => {
        const { workspace, namCookie, tuId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: tuId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.not_in_workspace,
        );
      });

      it('Row 12: workspace member with locked account (Dũng) returns 409 unavailable', async () => {
        const { workspace, namCookie, dungId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: dungId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.unavailable,
        );
      });

      it('Row 13: workspace admin without project row (Lan) returns 409 workspace_admin', async () => {
        const { workspace, namCookie, lanId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: lanId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.workspace_admin,
        );
      });

      it('Row 14: workspace guest (Bình) with contributor returns 409 members.0.role role_not_allowed', async () => {
        const { workspace, namCookie, binhId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: binhId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.role']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
        );
      });

      it('AC-04: Project Admin adding a Member with viewer role returns 409 MEMBERS_NOT_ADDABLE and no member added', async () => {
        const { workspace, namCookie, anId, projId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'viewer' }] })
          .expect(409);
        expect(res.body.code).toBe('MEMBERS_NOT_ADDABLE');
        expect(res.body.fields?.['members.0.role']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
        );
        expect(res.body.fields?.['members.0.role']).toBe(
          "This role isn't allowed for their workspace role.",
        );

        // Verify nobody was added
        const rows = await e2e.dataSource.query(
          `SELECT * FROM project_members WHERE project_id = $1 AND member_id = $2`,
          [projId, anId],
        );
        expect(rows).toHaveLength(0);
      });

      it('AC-05: adding workspace Guest with commenter returns 409; with viewer returns 201', async () => {
        const { workspace, namCookie, binhId } = await seedB63Fixture();
        const res409 = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: binhId, role: 'commenter' }] })
          .expect(409);
        expect(res409.body.code).toBe('MEMBERS_NOT_ADDABLE');
        expect(res409.body.fields?.['members.0.role']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
        );

        const res201 = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: binhId, role: 'viewer' }] })
          .expect(201);
        expect(res201.body.members).toHaveLength(1);
        expect(res201.body.members[0]).toMatchObject({
          userId: binhId,
          role: 'viewer',
        });
      });

      it('Row 15: already project member (Hoa) returns 409 already_member', async () => {
        const { workspace, namCookie, hoaId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: hoaId, role: 'contributor' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.already_member,
        );
      });

      it('Row 16: actor themselves (Nam) returns 409 already_member', async () => {
        const { workspace, namCookie, namId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: namId, role: 'admin' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.already_member,
        );
      });

      it('Row 17: Kai (Workspace Admin AND project row) returns 409 workspace_admin (prioritized over already_member)', async () => {
        const { workspace, namCookie, kaiId } = await seedB63Fixture();
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: kaiId, role: 'admin' }] })
          .expect(409);
        expect(res.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.workspace_admin,
        );
      });

      it('Row 18: contributor granted project.members.manage sending role: admin returns 403 "You can\'t assign this role"', async () => {
        const { workspace, anId } = await seedB63Fixture();
        await e2e.dataSource.query(
          `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
           VALUES ('project', 'contributor', 'project.members.manage', now())`,
        );

        const hoaCookie = await signInCookie('hoa-b63@openplany.dev');
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', hoaCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'admin' }] })
          .expect(403);
        expect(res.body.message).toContain(MEMBER_MESSAGES.roleNotAllowed);
      });

      it('Row 19 & 20: default contributor and project viewer return 403 (guard)', async () => {
        const { workspace, anId, projId } = await seedB63Fixture();
        const hoaCookie = await signInCookie('hoa-b63@openplany.dev');

        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', hoaCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(403);

        const guestId = await createUser('guest-user@openplany.dev', {
          is_superuser: false,
        });
        await addWorkspaceMember(workspace.id, guestId, 'member');
        await addProjectMember(projId, workspace.id, guestId, 'viewer');
        const guestCookie = await signInCookie('guest-user@openplany.dev');

        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', guestCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(403);
      });

      it('Row 21: Project Admin when workspace member loses workspace.members.view returns 403', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        await e2e.dataSource.query(
          `DELETE FROM role_permissions WHERE scope = 'workspace' AND role_key = 'member' AND permission_key = 'workspace.members.view'`,
        );

        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(403);
      });

      it('Row 22 (AC-22): non-existent project returns 404, soft-deleted project returns 404', async () => {
        const { workspace, namCookie, anId, projId } = await seedB63Fixture();
        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/NONEXIST/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(404);

        await e2e.dataSource.query(
          `UPDATE projects SET deleted_at = now() WHERE id = $1`,
          [projId],
        );

        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(404);
      });

      it('Row 23: missing or invalid Origin returns 403', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', 'https://malicious-site.com')
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(403);
      });

      it('Row 24 (AC-18): two concurrent requests adding same candidate An results in 201 + 409 already_member, 1 row, 1 history', async () => {
        const { workspace, namCookie, anId, projId } = await seedB63Fixture();

        const addCandidate = () =>
          http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send({ members: [{ userId: anId, role: 'contributor' }] })
            .then((r) => r);

        const [res1, res2] = await Promise.all([
          addCandidate(),
          addCandidate(),
        ]);
        const statuses = [res1.status, res2.status].sort((a, b) => a - b);
        expect(statuses).toEqual([201, 409]);

        const conflictRes = res1.status === 409 ? res1 : res2;
        expect(conflictRes.body.fields?.['members.0.userId']).toBe(
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.already_member,
        );

        const pmRows = await e2e.dataSource.query(
          `SELECT id FROM project_members WHERE project_id = $1 AND member_id = $2`,
          [projId, anId],
        );
        expect(pmRows).toHaveLength(1);

        const historyRows = await e2e.dataSource.query(
          `SELECT id FROM project_member_role_history WHERE project_id = $1 AND member_id = $2`,
          [projId, anId],
        );
        expect(historyRows).toHaveLength(1);
      });

      it('Row 25: 31st add request in 10 minutes returns 429 retryAfterSeconds', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();
        for (let i = 0; i < 30; i++) {
          await http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send({ members: [] })
            .expect(400);
        }

        const res31 = await http()
          .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: anId, role: 'contributor' }] })
          .expect(429);

        expect(res31.body.retryAfterSeconds).toBeDefined();
        expect(res31.body.retryAfterSeconds).toBeGreaterThan(0);
      });

      it('Concurrency: two project admins adding each other simultaneously does not deadlock', async () => {
        const { workspace } = await seedWorkspace(
          'owner-deadlock@openplany.dev',
          'ws-deadlock',
        );
        const pId = await createProject(
          workspace.id,
          'Project Deadlock',
          'PDL',
        );

        const adminAId = await createUser('admin-a@openplany.dev', {
          is_superuser: false,
        });
        const adminBId = await createUser('admin-b@openplany.dev', {
          is_superuser: false,
        });
        await addWorkspaceMember(workspace.id, adminAId, 'member');
        await addWorkspaceMember(workspace.id, adminBId, 'member');
        await addProjectMember(pId, workspace.id, adminAId, 'admin');
        await addProjectMember(pId, workspace.id, adminBId, 'admin');

        const cookieA = await signInCookie('admin-a@openplany.dev');
        const cookieB = await signInCookie('admin-b@openplany.dev');

        const cand1Id = await createUser('cand1@openplany.dev', {
          is_superuser: false,
        });
        const cand2Id = await createUser('cand2@openplany.dev', {
          is_superuser: false,
        });
        await addWorkspaceMember(workspace.id, cand1Id, 'member');
        await addWorkspaceMember(workspace.id, cand2Id, 'member');

        const reqA = http()
          .post(`/api/workspaces/${workspace.slug}/projects/PDL/members`)
          .set('Cookie', cookieA)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: cand1Id, role: 'contributor' }] });

        const reqB = http()
          .post(`/api/workspaces/${workspace.slug}/projects/PDL/members`)
          .set('Cookie', cookieB)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: cand2Id, role: 'contributor' }] });

        const [resA, resB] = await Promise.all([reqA, reqB]);
        expect(resA.status).toBe(201);
        expect(resB.status).toBe(201);
      });

      it('Concurrency: workspace batch addition concurrent with adding member to project does not return 500', async () => {
        const { workspace, cookie: ownerCookie } = await seedWorkspace(
          'owner-ws-batch@openplany.dev',
          'ws-batch',
        );
        const pId = await createProject(workspace.id, 'Project Batch', 'PBAT');

        const namId = await createUser('nam-batch@openplany.dev', {
          is_superuser: false,
        });
        await addWorkspaceMember(workspace.id, namId, 'member');
        await addProjectMember(pId, workspace.id, namId, 'admin');
        const namCookie = await signInCookie('nam-batch@openplany.dev');

        const targetP = await createUser('target-p@openplany.dev', {
          is_superuser: false,
        });
        const targetN = await createUser('target-n@openplany.dev', {
          is_superuser: false,
        });

        const wsAdd = http()
          .post(`/api/workspaces/${workspace.slug}/members`)
          .set('Cookie', ownerCookie)
          .set('Origin', ORIGIN)
          .send({
            members: [
              { userId: targetP, role: 'member' },
              { userId: targetN, role: 'member' },
            ],
          });

        const projAdd = http()
          .post(`/api/workspaces/${workspace.slug}/projects/PBAT/members`)
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ members: [{ userId: targetP, role: 'contributor' }] });

        const [resWs, resProj] = await Promise.all([wsAdd, projAdd]);
        expect(resWs.status).toBe(201);
        expect([201, 409]).toContain(resProj.status);
      });

      it('AC-29: logs of search candidates and add members contain zero PII (no emails, names, search queries)', async () => {
        const { workspace, namCookie, anId } = await seedB63Fixture();

        const loggedMessages: string[] = [];
        const logSpy = vi
          .spyOn(Logger.prototype, 'log')
          .mockImplementation((msg: string) => {
            loggedMessages.push(String(msg));
          });
        const debugSpy = vi
          .spyOn(Logger.prototype, 'debug')
          .mockImplementation((msg: string) => {
            loggedMessages.push(String(msg));
          });

        try {
          // 1. Search candidate
          await http()
            .get(
              `/api/workspaces/${workspace.slug}/projects/PB63/member-candidates?email=an-b63@openplany.dev`,
            )
            .set('Cookie', namCookie)
            .expect(200);

          // 2. Add member
          await http()
            .post(`/api/workspaces/${workspace.slug}/projects/PB63/members`)
            .set('Cookie', namCookie)
            .set('Origin', ORIGIN)
            .send({ members: [{ userId: anId, role: 'contributor' }] })
            .expect(201);

          expect(
            loggedMessages.some((m) =>
              m.includes('project.members.candidates'),
            ),
          ).toBe(true);
          expect(
            loggedMessages.some((m) => m.includes('project.members.added')),
          ).toBe(true);

          for (const msg of loggedMessages) {
            expect(msg).not.toContain('an-b63@openplany.dev');
            expect(msg).not.toContain('an-b63');
          }
        } finally {
          logSpy.mockRestore();
          debugSpy.mockRestore();
        }
      });
    });
  });

  describe('Feature 13 Ticket 06: Inherited members in project member list (AC-10, AC-11, AC-23)', () => {
    it('AC-10 & AC-11: combines assigned and active workspace admins, excludes deactivated workspace members', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-ac10@openplany.dev',
        'ws-ac10',
      );

      const admin2Id = await createUser('admin2-ac10@openplany.dev');
      await addWorkspaceMember(workspace.id, admin2Id, 'admin', true);

      const adminDeactivatedId = await createUser(
        'admin-deactivated@openplany.dev',
        { is_active: false },
      );
      await addWorkspaceMember(workspace.id, adminDeactivatedId, 'admin', true);

      const adminLeftId = await createUser('admin-left@openplany.dev');
      await addWorkspaceMember(workspace.id, adminLeftId, 'admin', false);

      const projectId = await createProject(
        workspace.id,
        'Project AC10',
        'PAC10',
      );

      const member1Id = await createUser('member1-ac10@openplany.dev');
      await addWorkspaceMember(workspace.id, member1Id, 'member', true);
      const member2Id = await createUser('member2-ac10@openplany.dev');
      await addWorkspaceMember(workspace.id, member2Id, 'member', true);

      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'contributor', true, $4, now(), now(), now()),
                ($1, $2, $5, 'commenter', true, $4, now(), now(), now())`,
        [workspace.id, projectId, member1Id, ownerId, member2Id],
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PAC10/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.truncated).toBe(false);
      expect(res.body.members).toHaveLength(5);
      expect(
        res.body.members
          .slice(0, 3)
          .map((m: ProjectMemberResponse) => m.source),
      ).toEqual(['inherited', 'inherited', 'inherited']);
      expect(
        res.body.members.slice(3).map((m: ProjectMemberResponse) => m.source),
      ).toEqual(['assigned', 'assigned']);

      const inherited = res.body.members.filter(
        (m: ProjectMemberResponse) => m.source === 'inherited',
      );
      expect(inherited).toHaveLength(3);
      for (const m of inherited) {
        expect(m.role).toBe('admin');
        expect(m.assignedRole).toBeNull();
        expect(m.joinedAt).toBeNull();
        expect(m.workspaceRole).toBe('admin');
      }

      const deactivatedMember = inherited.find(
        (m: ProjectMemberResponse) => m.userId === adminDeactivatedId,
      );
      expect(deactivatedMember).toBeDefined();
      expect(deactivatedMember.accountActive).toBe(false);

      const leftMember = res.body.members.find(
        (m: ProjectMemberResponse) => m.userId === adminLeftId,
      );
      expect(leftMember).toBeUndefined();

      const projectsRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      const proj = projectsRes.body.projects.find(
        (p: ProjectListItem) => p.identifier === 'PAC10',
      );
      expect(proj).toBeDefined();
      expect(proj.memberCount).toBe(2);
      expect(proj.members).toHaveLength(2);
    });

    it('AC-23: omits inherited members when viewer lacks workspace.members.view', async () => {
      const { workspace, ownerId } = await seedWorkspace(
        'owner-ac23@openplany.dev',
        'ws-ac23',
      );
      const projectId = await createProject(
        workspace.id,
        'Project AC23',
        'PAC23',
      );

      const guestId = await createUser('guest-ac23@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest', true);

      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'viewer', true, $4, now(), now(), now())`,
        [workspace.id, projectId, guestId, ownerId],
      );

      // Grant project.members.view to project viewer role (e.g. customized by instance admin)
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key)
         VALUES ('project', 'viewer', 'project.members.view')
         ON CONFLICT DO NOTHING`,
      );

      try {
        const guestCookie = await signInCookie('guest-ac23@openplany.dev');

        const res = await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PAC23/members`)
          .set('Cookie', guestCookie)
          .expect(200);

        expect(res.body.total).toBe(1);
        expect(res.body.members).toHaveLength(1);
        expect(res.body.members[0].source).toBe('assigned');
        expect(res.body.members[0].userId).toBe(guestId);

        const projectsRes = await http()
          .get(`/api/workspaces/${workspace.slug}/projects`)
          .set('Cookie', guestCookie)
          .expect(200);

        const proj = projectsRes.body.projects.find(
          (p: ProjectListItem) => p.identifier === 'PAC23',
        );
        expect(proj).toBeDefined();
        expect(proj.memberCount).toBe(1);
      } finally {
        await e2e.dataSource.query(
          `DELETE FROM role_permissions WHERE scope = 'project' AND role_key = 'viewer' AND permission_key = 'project.members.view'`,
        );
      }
    });
  });

  describe('Feature 16: Inherited workspace admins in project (AC-01, AC-03, AC-04, AC-15)', () => {
    it('AC-01 & AC-03: returns total=2, truncated=false with inherited first when viewer can view ws members; same total=2 without inherited when viewer lacks ws members view', async () => {
      const {
        workspace,
        ownerId,
        cookie: adminCookie,
      } = await seedWorkspace('owner-ac01@openplany.dev', 'ws-ac01');

      const admin2Id = await createUser('admin2-ac01@openplany.dev');
      await addWorkspaceMember(workspace.id, admin2Id, 'admin', true);

      const adminDeactivatedId = await createUser(
        'admin-deactivated-ac01@openplany.dev',
        { is_active: false },
      );
      await addWorkspaceMember(workspace.id, adminDeactivatedId, 'admin', true);

      const adminLeftId = await createUser('admin-left-ac01@openplany.dev');
      await addWorkspaceMember(workspace.id, adminLeftId, 'admin', false);

      const projectId = await createProject(
        workspace.id,
        'Project AC01',
        'PAC01',
      );

      const member1Id = await createUser('member1-ac01@openplany.dev');
      await addWorkspaceMember(workspace.id, member1Id, 'member', true);
      const member2Id = await createUser('member2-ac01@openplany.dev');
      await addWorkspaceMember(workspace.id, member2Id, 'member', true);

      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'contributor', true, $4, now(), now(), now()),
                ($1, $2, $5, 'commenter', true, $4, now(), now(), now())`,
        [workspace.id, projectId, member1Id, ownerId, member2Id],
      );

      // Viewer with workspace.members.view (adminCookie) -> AC-01
      const resWithWsView = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PAC01/members`)
        .set('Cookie', adminCookie)
        .expect(200);

      expect(resWithWsView.body.total).toBe(2);
      expect(resWithWsView.body.truncated).toBe(false);
      expect(resWithWsView.body.members).toHaveLength(5);
      expect(
        resWithWsView.body.members
          .slice(0, 3)
          .map((m: ProjectMemberResponse) => m.source),
      ).toEqual(['inherited', 'inherited', 'inherited']);
      expect(
        resWithWsView.body.members
          .slice(3)
          .map((m: ProjectMemberResponse) => m.source),
      ).toEqual(['assigned', 'assigned']);

      // Viewer without workspace.members.view (guest with project.members.view granted) -> AC-03
      const guestId = await createUser('guest-ac03@openplany.dev');
      await addWorkspaceMember(workspace.id, guestId, 'guest', true);
      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'viewer', true, $4, now(), now(), now())`,
        [workspace.id, projectId, guestId, ownerId],
      );
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key)
         VALUES ('project', 'viewer', 'project.members.view')
         ON CONFLICT DO NOTHING`,
      );

      try {
        const guestCookie = await signInCookie('guest-ac03@openplany.dev');
        const resWithoutWsView = await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PAC01/members`)
          .set('Cookie', guestCookie)
          .expect(200);

        expect(resWithoutWsView.body.total).toBe(3);
        expect(resWithoutWsView.body.truncated).toBe(false);
        expect(
          resWithoutWsView.body.members.filter(
            (m: ProjectMemberResponse) => m.source === 'inherited',
          ),
        ).toHaveLength(0);
        expect(resWithoutWsView.body.members).toHaveLength(3);

        // And verify viewer with workspace.members.view also sees total = 3
        const resAdminCheck = await http()
          .get(`/api/workspaces/${workspace.slug}/projects/PAC01/members`)
          .set('Cookie', adminCookie)
          .expect(200);
        expect(resAdminCheck.body.total).toBe(resWithoutWsView.body.total);
        expect(resAdminCheck.body.total).toBe(3);
        expect(resAdminCheck.body.members).toHaveLength(6); // 3 inherited + 3 assigned
      } finally {
        await e2e.dataSource.query(
          `DELETE FROM role_permissions WHERE scope = 'project' AND role_key = 'viewer' AND permission_key = 'project.members.view'`,
        );
      }
    });

    it('AC-04: project with PROJECT_MEMBER_LIST_MAX + 5 members and 3 workspace admins -> total=1005, truncated=true, 3 inherited + 1000 assigned', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-ac04@openplany.dev',
        'ws-ac04',
      );

      const admin2Id = await createUser('admin2-ac04@openplany.dev');
      await addWorkspaceMember(workspace.id, admin2Id, 'admin', true);
      const admin3Id = await createUser('admin3-ac04@openplany.dev');
      await addWorkspaceMember(workspace.id, admin3Id, 'admin', true);

      const projectId = await createProject(
        workspace.id,
        'Project AC04',
        'PAC04',
      );

      // Fast bulk insert of 1005 members using Postgres generate_series
      await e2e.dataSource.query(
        `INSERT INTO users (id, email, username, password, first_name, last_name, display_name, user_timezone, is_superuser, is_active, is_bot, created_at, updated_at, date_joined)
         SELECT
           ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           'ac04-bulk-' || i || '@openplany.dev',
           'ac04-bulk-' || i,
           'hash',
           'First' || i,
           'Last' || i,
           'User ' || i,
           'UTC',
           false,
           true,
           false,
           now(),
           now(),
           now()
         FROM generate_series(1, 1005) AS s(i)`,
      );

      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, joined_at, created_at, updated_at)
         SELECT
           $1,
           ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           'member',
           true,
           now(),
           now(),
           now()
         FROM generate_series(1, 1005) AS s(i)`,
        [workspace.id],
      );

      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         SELECT
           $1,
           $2,
           ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           'contributor',
           true,
           $3,
           now(),
           now(),
           now()
         FROM generate_series(1, 1005) AS s(i)`,
        [workspace.id, projectId, ownerId],
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PAC04/members`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.total).toBe(1005);
      expect(res.body.truncated).toBe(true);
      expect(res.body.members).toHaveLength(1003); // 3 inherited + 1000 assigned
      expect(
        res.body.members
          .slice(0, 3)
          .map((m: ProjectMemberResponse) => m.source),
      ).toEqual(['inherited', 'inherited', 'inherited']);
      expect(
        res.body.members
          .slice(3)
          .map((m: ProjectMemberResponse) => m.source)
          .every((s: string) => s === 'assigned'),
      ).toBe(true);
    });

    it('AC-15: corrupted data with active project_members row for workspace admin -> total=2, appears only once as inherited', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace(
        'owner-ac15@openplany.dev',
        'ws-ac15',
      );

      // Create a second workspace admin
      const admin2Id = await createUser('admin2-ac15@openplany.dev');
      await addWorkspaceMember(workspace.id, admin2Id, 'admin', true);

      const projectId = await createProject(
        workspace.id,
        'Project AC15',
        'PAC15',
      );

      // Create 2 normal project members
      const member1Id = await createUser('member1-ac15@openplany.dev');
      await addWorkspaceMember(workspace.id, member1Id, 'member', true);
      const member2Id = await createUser('member2-ac15@openplany.dev');
      await addWorkspaceMember(workspace.id, member2Id, 'member', true);

      // Insert corrupt row: admin2Id ALSO has an active row in project_members!
      await e2e.dataSource.query(
        `INSERT INTO project_members (workspace_id, project_id, member_id, role, is_active, created_by_id, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'contributor', true, $4, now(), now(), now()),
                ($1, $2, $5, 'commenter', true, $4, now(), now(), now()),
                ($1, $2, $6, 'admin', true, $4, now(), now(), now())`,
        [workspace.id, projectId, member1Id, ownerId, member2Id, admin2Id],
      );

      const res = await http()
        .get(`/api/workspaces/${workspace.slug}/projects/PAC15/members`)
        .set('Cookie', cookie)
        .expect(200);

      // Total must only count the 2 legitimate project members
      expect(res.body.total).toBe(2);
      expect(res.body.truncated).toBe(false);

      // admin2Id must only appear ONCE in the list, and as inherited
      const admin2Occurrences = res.body.members.filter(
        (m: ProjectMemberResponse) => m.userId === admin2Id,
      );
      expect(admin2Occurrences).toHaveLength(1);
      expect(admin2Occurrences[0].source).toBe('inherited');

      // Total members returned: 2 inherited (owner + admin2) + 2 assigned (member1 + member2) = 4
      expect(res.body.members).toHaveLength(4);

      // GET /projects returns memberCount = 2 matching total = 2 (neither counts corrupt admin2 row)
      const projectsRes = await http()
        .get(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .expect(200);

      const proj = projectsRes.body.projects.find(
        (p: ProjectListItem) => p.identifier === 'PAC15',
      );
      expect(proj).toBeDefined();
      expect(proj.memberCount).toBe(2);
      expect(proj.members).toHaveLength(2);
    });
  });

  describe('PATCH /api/workspaces/:slug/projects/:identifier/members/:userId', () => {
    it('AC-01: Nam changes An role from commenter to contributor with history and audit log', async () => {
      const { workspace, projId, namId, namCookie, anId } =
        await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      const loggedMessages: string[] = [];
      const logSpy = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((msg: string) => {
          loggedMessages.push(String(msg));
        });

      try {
        const res = await http()
          .patch(
            `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
          )
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'commenter', role: 'contributor' });

        expect(res.status).toBe(200);

        expect(res.body.assignedAdminCount).toBe(1);
        expect(res.body.member).toMatchObject({
          userId: anId,
          role: 'contributor',
          assignedRole: 'contributor',
          source: 'assigned',
        });

        const history = await e2e.dataSource.query(
          `SELECT * FROM project_member_role_history WHERE project_id = $1 AND member_id = $2`,
          [projId, anId],
        );
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          change_type: 'role_changed',
          from_role: 'commenter',
          to_role: 'contributor',
          actor_id: namId,
        });

        expect(
          loggedMessages.some((m) => m.includes('project.member.role.changed')),
        ).toBe(true);
        for (const msg of loggedMessages) {
          expect(msg).not.toContain('an-b63@openplany.dev');
        }
      } finally {
        logSpy.mockRestore();
      }
    });

    it('AC-05: member cannot change own role (returns 403 FORBIDDEN)', async () => {
      const { workspace, namId, namCookie } = await seedB63Fixture();

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${namId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('AC-06: returns 400 PROJECT_ROLE_NOT_ALLOWED when trying to assign viewer to workspace member', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'viewer' })
        .expect(400);

      expect(res.body.code).toBe('PROJECT_ROLE_NOT_ALLOWED');
    });

    it('returns 409 ROLE_CHANGED when fromRole does not match current assigned role', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(409);

      expect(res.body.code).toBe('ROLE_CHANGED');
    });

    it('returns 409 ROLE_INHERITED when target user is an inherited workspace admin', async () => {
      const { workspace, kaiCookie, ownerId } = await seedB63Fixture();

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${ownerId}`,
        )
        .set('Cookie', kaiCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(409);

      expect(res.body.code).toBe('ROLE_INHERITED');
    });

    it('AC-04 & AC-12: Workspace Admin demotes Project Admin to Contributor, returns updated assignedAdminCount = 0', async () => {
      const { workspace, projId, kaiCookie, namId, kaiId } =
        await seedB63Fixture();

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${namId}`,
        )
        .set('Cookie', kaiCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(200);

      expect(res.body.assignedAdminCount).toBe(0);
      expect(res.body.member).toMatchObject({
        userId: namId,
        role: 'contributor',
        assignedRole: 'contributor',
        source: 'assigned',
      });

      const history = await e2e.dataSource.query(
        `SELECT * FROM project_member_role_history WHERE project_id = $1 AND member_id = $2`,
        [projId, namId],
      );
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        change_type: 'role_changed',
        from_role: 'admin',
        to_role: 'contributor',
        actor_id: kaiId,
      });
    });

    it('AC-03: Project Admin cannot change another Project Admin (returns 403 FORBIDDEN cantChange)', async () => {
      const { workspace, projId, namCookie, hoaId } = await seedB63Fixture();
      await e2e.dataSource.query(
        `UPDATE project_members SET role = 'admin' WHERE member_id = $1 AND project_id = $2`,
        [hoaId, projId],
      );

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${hoaId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe(PROJECT_ROLE_CHANGE_MESSAGES.cantChange);
    });

    it('AC-07: Contributor with project.members.manage cannot assign admin (returns 403 ROLE_NOT_ALLOWED roleNotAllowed)', async () => {
      const { workspace, anId, projId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
         VALUES ('project', 'contributor', 'project.members.manage', now())`,
      );

      const hoaCookie = await signInCookie('hoa-b63@openplany.dev');
      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', hoaCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'admin' })
        .expect(403);

      expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
      expect(res.body.message).toBe(MEMBER_MESSAGES.roleNotAllowed);
    });

    it('AC-09: returns 404 NOT_FOUND memberGone when target is not a project member or left workspace', async () => {
      const { workspace, namCookie, tuId, dungId } = await seedB63Fixture();

      // tuId is outside workspace
      const resTu = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${tuId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'contributor' })
        .expect(404);
      expect(resTu.body.code).toBe('NOT_FOUND');
      expect(resTu.body.message).toBe(PROJECT_ROLE_CHANGE_MESSAGES.memberGone);

      // dungId is deactivated workspace member
      const resDung = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${dungId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'contributor' })
        .expect(404);
      expect(resDung.body.code).toBe('NOT_FOUND');
      expect(resDung.body.message).toBe(
        PROJECT_ROLE_CHANGE_MESSAGES.memberGone,
      );
    });

    it('AC-13 & AC-18: two identical concurrent requests -> one 200, one 409 ROLE_CHANGED, 1 history row', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      const sendChange = () =>
        http()
          .patch(
            `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
          )
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'commenter', role: 'contributor' })
          .then((r) => r);

      const [res1, res2] = await Promise.all([sendChange(), sendChange()]);
      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.code).toBe('ROLE_CHANGED');

      const history = await e2e.dataSource.query(
        `SELECT * FROM project_member_role_history WHERE project_id = $1 AND member_id = $2`,
        [projId, anId],
      );
      expect(history).toHaveLength(1);
    });

    it('AC-17: soft-deleted project returns 404 PROJECT_NOT_FOUND', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      await e2e.dataSource.query(
        `UPDATE projects SET deleted_at = now() WHERE id = $1`,
        [projId],
      );

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'contributor' })
        .expect(404);

      expect(res.body.code).toBe('PROJECT_NOT_FOUND');
      expect(res.body.message).toBe(PROJECT_ERROR_MESSAGES.notFound);
    });

    it('AC-19: missing or invalid Origin returns 403', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', 'https://malicious.com')
        .send({ fromRole: 'commenter', role: 'contributor' })
        .expect(403);
    });

    it('AC-20: 31st write request in 10 minutes returns 429 retryAfterSeconds', async () => {
      const { workspace, projId, namCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      for (let i = 0; i < 30; i++) {
        await http()
          .patch(
            `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
          )
          .set('Cookie', namCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'invalid', role: 'invalid' })
          .expect(400);
      }

      const res31 = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'commenter', role: 'contributor' })
        .expect(429);

      expect(res31.body.retryAfterSeconds).toBeDefined();
      expect(res31.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('AC-21: concurrent project role change and workspace role change does not return 500', async () => {
      const { workspace, projId, kaiCookie, anId } = await seedB63Fixture();
      await addProjectMember(projId, workspace.id, anId, 'commenter');

      const projectChange = () =>
        http()
          .patch(
            `/api/workspaces/${workspace.slug}/projects/PB63/members/${anId}`,
          )
          .set('Cookie', kaiCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'commenter', role: 'contributor' });

      const wsChange = () =>
        http()
          .patch(`/api/workspaces/${workspace.slug}/members/${anId}`)
          .set('Cookie', kaiCookie)
          .set('Origin', ORIGIN)
          .send({ fromRole: 'member', role: 'admin' });

      const calls = [];
      for (let i = 0; i < 10; i++) {
        calls.push(projectChange(), wsChange());
      }
      const results = await Promise.all(calls);
      for (const r of results) {
        expect(r.status).toBeLessThan(500);
      }
    });

    it('AC-25 (D16): actor without workspace.members.view gets 404 memberGone when targeting inherited workspace admin', async () => {
      const { workspace, namCookie, ownerId } = await seedB63Fixture();

      await e2e.dataSource.query(
        `DELETE FROM role_permissions WHERE scope = 'workspace' AND role_key = 'member' AND permission_key = 'workspace.members.view'`,
      );

      const res = await http()
        .patch(
          `/api/workspaces/${workspace.slug}/projects/PB63/members/${ownerId}`,
        )
        .set('Cookie', namCookie)
        .set('Origin', ORIGIN)
        .send({ fromRole: 'admin', role: 'contributor' })
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.message).toBe(PROJECT_ROLE_CHANGE_MESSAGES.memberGone);
    });
  });
});
