import request from 'supertest';
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { PROJECT_NAME_MAX, en as enCatalog, vi as viCatalog } from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  DEFAULT_E2E_ORIGIN as ORIGIN,
  createUser,
  signInCookie,
} from './helpers/e2eUsers.js';

/** Interpolates a catalog sentence the way the API's i18next instance does. */
function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]));
}

describe('i18n Accept-Language & error responses (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const B6_CASES = [
    { header: undefined, expectedLang: 'en', label: 'missing' },
    { header: 'vi', expectedLang: 'vi', label: 'vi' },
    { header: 'VI', expectedLang: 'vi', label: 'VI' },
    { header: ' vi ', expectedLang: 'vi', label: ' vi ' },
    { header: 'vi-VN', expectedLang: 'vi', label: 'vi-VN' },
    { header: 'en-US,en;q=0.9', expectedLang: 'en', label: 'en-US,en;q=0.9' },
    { header: 'fr-FR, vi;q=0.5', expectedLang: 'vi', label: 'fr-FR, vi;q=0.5' },
    { header: 'en;q=0.4, vi;q=0.8', expectedLang: 'vi', label: 'en;q=0.4, vi;q=0.8' },
    { header: 'vi;q=0', expectedLang: 'en', label: 'vi;q=0' },
    { header: 'vi;q=abc', expectedLang: 'en', label: 'vi;q=abc' },
    { header: 'vi;q=2', expectedLang: 'en', label: 'vi;q=2' },
    { header: 'vi;q=0x1', expectedLang: 'en', label: 'vi;q=0x1' },
    { header: 'vi;q=', expectedLang: 'en', label: 'vi;q=' },
    { header: 'vi;level=1', expectedLang: 'vi', label: 'vi;level=1' },
    { header: '*', expectedLang: 'en', label: '*' },
    { header: 'fr', expectedLang: 'en', label: 'fr' },
    { header: '', expectedLang: 'en', label: 'empty' },
    { header: ';;;', expectedLang: 'en', label: ';;;' },
    { header: 'vi' + 'a'.repeat(255), expectedLang: 'en', label: '257 chars starting with vi' },
  ];

  for (const { header, expectedLang, label } of B6_CASES) {
    it(`sets Content-Language: ${expectedLang} and Vary on success with Accept-Language: "${label}"`, async () => {
      let req = request(e2e.app.getHttpServer()).get('/api/health');
      if (header !== undefined) {
        req = req.set('Accept-Language', header);
      }
      const res = await req.expect(200);

      expect(res.headers['content-language']).toBe(expectedLang);
      expect(res.headers.vary).toContain('Accept-Language');
    });

    it(`sets Content-Language: ${expectedLang} on error with Accept-Language: "${label}"`, async () => {
      let req = request(e2e.app.getHttpServer()).get('/api/not-a-real-endpoint');
      if (header !== undefined) {
        req = req.set('Accept-Language', header);
      }
      const res = await req.expect(404);

      expect(res.headers['content-language']).toBe(expectedLang);
      expect(res.headers.vary).toContain('Accept-Language');
      expect(res.body.statusCode).toBe(404);
      if (expectedLang === 'vi') {
        expect(res.body.message).toBe('Không tìm thấy nội dung bạn cần');
      } else {
        expect(res.body.message).toBe('Cannot GET /api/not-a-real-endpoint');
      }
    });
  }

  it('handles concurrent requests with different languages without cross-contamination (INV-05, AC-19)', async () => {
    const server = e2e.app.getHttpServer();

    // Fire 10 parallel requests alternating between vi and en
    const promises = Array.from({ length: 10 }, (_, i) => {
      const isVi = i % 2 === 0;
      let req = request(server).get('/api/not-a-real-endpoint');
      if (isVi) {
        req = req.set('Accept-Language', 'vi');
      }
      return req.then((res) => ({ res, isVi, index: i }));
    });

    const results = await Promise.all(promises);

    for (const { res, isVi, index } of results) {
      expect(res.status).toBe(404);
      if (isVi) {
        expect(res.headers['content-language']).toBe('vi');
        expect(res.body.message, `Request ${index} must have Vietnamese message`).toBe(
          'Không tìm thấy nội dung bạn cần',
        );
      } else {
        expect(res.headers['content-language']).toBe('en');
        expect(res.body.message, `Request ${index} must have English message`).toBe(
          'Cannot GET /api/not-a-real-endpoint',
        );
      }
    }
  });

  it('translates validation error field messages when Accept-Language is vi', async () => {
    const resVi = await request(e2e.app.getHttpServer())
      .post('/api/auth/sign-in')
      .set('Origin', 'http://localhost:5173')
      .set('Accept-Language', 'vi')
      .send({})
      .expect(400);

    expect(resVi.headers['content-language']).toBe('vi');
    expect(resVi.body.code).toBe('VALIDATION_ERROR');
    expect(resVi.body.message).toBe('Kiểm tra các trường được đánh dấu');
  });

  describe('translated validation and domain errors (API B9)', () => {
    const http = () => request(e2e.app.getHttpServer());
    const LANGUAGES = [
      { lang: 'en', catalog: enCatalog },
      { lang: 'vi', catalog: viCatalog },
    ] as const;

    beforeEach(async () => {
      await e2e.reset();
    });

    async function seedWorkspace(slug: string) {
      const email = `${slug}@openplany.dev`;
      const ownerId = await createUser(e2e, email, { is_superuser: true });
      const cookie = await signInCookie(e2e, email);
      const res = await http()
        .post('/api/workspaces')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Acme', slug, organizationSize: '2-10' })
        .expect(201);
      return { workspace: res.body as { id: string; slug: string }, ownerId, cookie };
    }

    // Two @Matches on one property: each failure reports its own sentence (INV-06).
    for (const { lang, catalog } of LANGUAGES) {
      it.each([
        { name: 'see http://x.com', key: 'errors.nameUrl' },
        { name: 'Acme\u200B', key: 'errors.nameHiddenChars' },
      ] as const)(`workspace name $name reports $key in ${lang}`, async ({ name, key }) => {
        const { cookie } = await seedWorkspace(`i18n-ws-${lang}`);
        const res = await http()
          .post('/api/workspaces')
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .set('Accept-Language', lang)
          .send({ name, slug: `i18n-other-${lang}`, organizationSize: '2-10' })
          .expect(400);

        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.fields).toEqual({ name: catalog.workspace[key] });
      });

      it(`project name over PROJECT_NAME_MAX reports the max in ${lang}`, async () => {
        const { workspace, cookie } = await seedWorkspace(`i18n-pn-${lang}`);
        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/projects`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .set('Accept-Language', lang)
          .send({
            name: 'x'.repeat(PROJECT_NAME_MAX + 1),
            identifier: 'LONG',
            icon: { name: 'rocket', color: '#15AABF' },
            coverKey: 'cover-01',
          })
          .expect(400);

        expect(res.body.fields).toEqual({
          name: interpolate(catalog.project['errors.nameTooLong'], {
            max: PROJECT_NAME_MAX,
          }),
        });
      });

      it(`adding a member above the actor's role returns ROLE_NOT_ALLOWED in ${lang} (AC-21)`, async () => {
        const { workspace } = await seedWorkspace(`i18n-add-${lang}`);
        const memberEmail = `member-${lang}@openplany.dev`;
        const memberId = await createUser(e2e, memberEmail);
        const targetId = await createUser(e2e, `target-${lang}@openplany.dev`);
        await e2e.dataSource.query(
          `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at, joined_at)
           VALUES ($1, $2, 'member', now(), now(), now())`,
          [workspace.id, memberId],
        );
        await e2e.dataSource.query(
          `INSERT INTO role_permissions (scope, role_key, permission_key, created_at)
           VALUES ('workspace', 'member', 'workspace.members.add', now())`,
        );

        const res = await http()
          .post(`/api/workspaces/${workspace.slug}/members`)
          .set('Cookie', await signInCookie(e2e, memberEmail))
          .set('Origin', ORIGIN)
          .set('Accept-Language', lang)
          .send({ members: [{ userId: targetId, role: 'admin' }] })
          .expect(403);

        expect(res.body.code).toBe('ROLE_NOT_ALLOWED');
        expect(res.body.message).toBe(catalog.members['errors.roleNotAllowed']);
      });
    }

    it('an undeclared body property keeps the class-validator sentence in en and errors:invalidValue in vi', async () => {
      const payload = { email: 'an@openplany.dev', password: 'Secret123!', extra: 1 };
      const resEn = await http()
        .post('/api/auth/sign-in')
        .set('Origin', ORIGIN)
        .send(payload)
        .expect(400);
      expect(resEn.body.fields).toEqual({ extra: 'property extra should not exist' });

      const resVi = await http()
        .post('/api/auth/sign-in')
        .set('Origin', ORIGIN)
        .set('Accept-Language', 'vi')
        .send(payload)
        .expect(400);
      expect(resVi.body.fields).toEqual({ extra: viCatalog.errors.invalidValue });
    });

    it('a constraint without a declared message keeps its sentence in en and errors:invalidValue in vi', async () => {
      const { workspace, ownerId, cookie } = await seedWorkspace('i18n-role');
      await http()
        .post(`/api/workspaces/${workspace.slug}/projects`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Roles',
          identifier: 'ROLE',
          icon: { name: 'rocket', color: '#15AABF' },
          coverKey: 'cover-01',
        })
        .expect(201);

      const changeRole = (lang?: string) => {
        const req = http()
          .patch(`/api/workspaces/${workspace.slug}/projects/ROLE/members/${ownerId}`)
          .set('Cookie', cookie)
          .set('Origin', ORIGIN);
        return (lang === undefined ? req : req.set('Accept-Language', lang))
          .send({ fromRole: 'admin', role: 'boss' })
          .expect(400);
      };

      expect((await changeRole()).body.fields).toEqual({
        role: 'role must be one of the following values: admin, contributor, commenter, viewer',
      });
      expect((await changeRole('vi')).body.fields).toEqual({
        role: viCatalog.errors.invalidValue,
      });
    });
  });
});
