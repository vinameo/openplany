import crypto from 'node:crypto';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import {
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
  vi,
} from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type StateMutationResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  signInCookie,
  DEFAULT_E2E_ORIGIN as ORIGIN,
} from './helpers/e2eUsers.js';

describe('State Logging & Vietnamese Localization (e2e)', () => {
  let e2e: E2eApp;
  let userSeq = 0;

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

  async function newUser(opts: { instanceAdmin?: boolean } = {}) {
    userSeq += 1;
    const email = `audit-user-${userSeq}@openplany.dev`;
    const id = await createUser(e2e, email, {
      is_superuser: opts.instanceAdmin ?? false,
    });
    return { id, email, cookie: await signInCookie(e2e, email) };
  }

  async function seedWorkspace() {
    const owner = await newUser({ instanceAdmin: true });
    const wsRes = await http()
      .post('/api/workspaces')
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: `Audit Workspace ${userSeq}`,
        slug: `ws-audit-${userSeq}`,
        organizationSize: '2-10',
      })
      .expect(201);
    return {
      id: wsRes.body.id as string,
      slug: wsRes.body.slug as string,
      owner,
    };
  }

  async function seedProject(ws: {
    id: string;
    slug: string;
    owner: { cookie: string };
  }) {
    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Secret Project Name',
        identifier: 'SPN',
        description: 'Audit test project',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    return {
      id: res.body.project.id as string,
      identifier: res.body.project.identifier as string,
    };
  }

  describe('AC-37, INV-17: Logging Audit (No PII / State Name Leaks)', () => {
    it('state.created: logs structured JSON with workspace, state ID, level, group, actor ID, without state name or PII', async () => {
      const ws = await seedWorkspace();
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      const sensitiveName = 'Super Secret Internal Name 42';
      const res = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: sensitiveName, group: 'active', color: '#3E7BD6' })
        .expect(201);

      const stateId = (res.body as StateMutationResponse).state.id;

      const matchingCalls = logSpy.mock.calls.filter(([arg]) => {
        try {
          const parsed = JSON.parse(arg as string);
          return parsed.event === 'state.created' && parsed.stateId === stateId;
        } catch {
          return false;
        }
      });

      expect(matchingCalls.length).toBe(1);
      const parsedLog = JSON.parse(matchingCalls[0]![0] as string);

      expect(parsedLog).toEqual({
        event: 'state.created',
        workspaceId: ws.id,
        stateId,
        level: 'workspace',
        group: 'active',
        actorId: ws.owner.id,
        requestId: expect.any(String),
      });

      // Assert no leak of state name or actor email anywhere in the log string
      const fullLogString = matchingCalls[0]![0] as string;
      expect(fullLogString).not.toContain(sensitiveName);
      expect(fullLogString).not.toContain(ws.owner.email);
    });

    it('state.updated: logs structured JSON with changed fields, without state name or PII', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const oldName = 'Old Private Name';
      const createdRes = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: oldName, group: 'planned', color: '#5B6B82' })
        .expect(201);
      const stateId = (createdRes.body as StateMutationResponse).state.id;

      const logSpy = vi.spyOn(Logger.prototype, 'log');

      const newName = 'New Confidential State';
      await http()
        .patch(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/${stateId}`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: newName, color: '#2F9E6E' })
        .expect(200);

      const matchingCalls = logSpy.mock.calls.filter(([arg]) => {
        try {
          const parsed = JSON.parse(arg as string);
          return parsed.event === 'state.updated' && parsed.stateId === stateId;
        } catch {
          return false;
        }
      });

      expect(matchingCalls.length).toBe(1);
      const parsedLog = JSON.parse(matchingCalls[0]![0] as string);

      expect(parsedLog).toEqual({
        event: 'state.updated',
        workspaceId: ws.id,
        projectId: project.id,
        stateId,
        level: 'project',
        group: 'planned',
        actorId: ws.owner.id,
        changed: ['name', 'color'],
        requestId: expect.any(String),
      });

      const fullLogString = matchingCalls[0]![0] as string;
      expect(fullLogString).not.toContain(oldName);
      expect(fullLogString).not.toContain(newName);
      expect(fullLogString).not.toContain('Secret Project Name');
      expect(fullLogString).not.toContain(ws.owner.email);
    });

    it('state.deleted: logs structured JSON with replacementStateId, movedWorkItems, durationMs, without state names', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const stateToDelete = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State To Delete', group: 'active', color: '#7A5CC7' })
        .expect(201);
      const targetStateId = (stateToDelete.body as StateMutationResponse).state
        .id;

      const [todoDefault] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // Create a work item in the target state
      await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({
          title: 'Work item to move',
          description: 'Description',
          idempotencyKey: crypto.randomUUID(),
          stateId: targetStateId,
        })
        .expect(201);

      const logSpy = vi.spyOn(Logger.prototype, 'log');

      await http()
        .delete(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/${targetStateId}?replacementStateId=${todoDefault.id}`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      const matchingCalls = logSpy.mock.calls.filter(([arg]) => {
        try {
          const parsed = JSON.parse(arg as string);
          return (
            parsed.event === 'state.deleted' && parsed.stateId === targetStateId
          );
        } catch {
          return false;
        }
      });

      expect(matchingCalls.length).toBe(1);
      const parsedLog = JSON.parse(matchingCalls[0]![0] as string);

      expect(parsedLog).toEqual({
        event: 'state.deleted',
        workspaceId: ws.id,
        projectId: project.id,
        stateId: targetStateId,
        level: 'project',
        group: 'active',
        actorId: ws.owner.id,
        replacementStateId: todoDefault.id,
        movedWorkItems: 1,
        durationMs: expect.any(Number),
        requestId: expect.any(String),
      });

      const fullLogString = matchingCalls[0]![0] as string;
      expect(fullLogString).not.toContain('State To Delete');
      expect(fullLogString).not.toContain('Secret Project Name');
      expect(fullLogString).not.toContain(ws.owner.email);
    });

    it('rejected requests (404, 409) produce NO state write log entries', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      // Create initial state
      await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Unique State', group: 'active', color: '#3E7BD6' })
        .expect(201);

      const logSpy = vi.spyOn(Logger.prototype, 'log');
      logSpy.mockClear();

      // 1. Name taken (409)
      await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'unique state', group: 'active', color: '#3E7BD6' })
        .expect(409);

      // 2. Not found (404)
      await http()
        .patch(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/00000000-0000-0000-0000-000000000000`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'New Name' })
        .expect(404);

      // Verify no state.* logs were emitted for the failed operations
      const stateLogCalls = logSpy.mock.calls.filter(([arg]) => {
        try {
          const parsed = JSON.parse(arg as string);
          return (
            typeof parsed.event === 'string' &&
            parsed.event.startsWith('state.')
          );
        } catch {
          return false;
        }
      });

      expect(stateLogCalls).toHaveLength(0);
    });

    it('rate limit warning: logs state.write.rate_limited at most once per user per window (logOncePerWindow: true)', async () => {
      const ws = await seedWorkspace();
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');
      warnSpy.mockClear();

      // 1st write: create a state
      const createdRes = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Initial Rate State', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateId = (createdRes.body as StateMutationResponse).state.id;

      // Writes 2 to 60: patch the state alternating colors without exceeding WORKSPACE_STATES_MAX (50)
      for (let i = 2; i <= 60; i++) {
        const color = i % 2 === 0 ? '#2F9E6E' : '#3E7BD6';
        await http()
          .patch(`/api/workspaces/${ws.slug}/states/${stateId}`)
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN)
          .send({ color })
          .expect(200);
      }

      // 61st request is blocked by rate limiter
      const res61 = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State Limit 61', group: 'active', color: '#3E7BD6' })
        .expect(429);

      expect(res61.body.code).toBe('TOO_MANY_ATTEMPTS');

      // 62nd request is also blocked
      const res62 = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State Limit 62', group: 'active', color: '#3E7BD6' })
        .expect(429);

      expect(res62.body.code).toBe('TOO_MANY_ATTEMPTS');

      // Filter warn calls for state.write.rate_limited
      const rateLimitWarns = warnSpy.mock.calls.filter(
        ([arg]) =>
          typeof arg === 'string' && arg.includes('state.write.rate_limited'),
      );

      // Must be logged exactly ONCE despite two blocked requests
      expect(rateLimitWarns.length).toBe(1);
      expect(rateLimitWarns[0]![0]).toContain(`userId=${ws.owner.id}`);
      expect(rateLimitWarns[0]![0]).toContain('bucket=state_write');
    });
  });

  describe('AC-36, D2: Vietnamese Localization (Accept-Language: vi)', () => {
    it('returns default 5 state names in English when Accept-Language: vi is provided (D2)', async () => {
      const ws = await seedWorkspace();

      const res = await http()
        .get(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .set('Accept-Language', 'vi')
        .expect(200);

      expect(res.headers['content-language']).toBe('vi');
      const defaultStateNames = res.body.states
        .filter((s: { level: string }) => s.level === 'default')
        .map((s: { name: string }) => s.name);

      expect(defaultStateNames).toEqual([
        'Backlog',
        'Todo',
        'In Progress',
        'Done',
        'Cancelled',
      ]);
    });

    it('translates duplicate state name error message to Vietnamese', async () => {
      const ws = await seedWorkspace();

      await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Duplicated State', group: 'active', color: '#3E7BD6' })
        .expect(201);

      const res = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .set('Accept-Language', 'vi')
        .send({ name: 'duplicated state', group: 'active', color: '#3E7BD6' })
        .expect(409);

      expect(res.headers['content-language']).toBe('vi');
      expect(res.body.code).toBe('STATE_NAME_TAKEN');
      expect(res.body.message).toBe('Đã có trạng thái trùng tên.');
      expect(res.body.fields?.name).toBe('Đã có trạng thái trùng tên.');
    });

    it('translates validation error field messages to Vietnamese', async () => {
      const ws = await seedWorkspace();

      const res = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .set('Accept-Language', 'vi')
        .send({ name: '   ', group: 'active', color: '#3E7BD6' })
        .expect(400);

      expect(res.headers['content-language']).toBe('vi');
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields?.name).toBe('Nhập tên');
    });

    it('translates work item creation error when requested state is unavailable', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const res = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .set('Accept-Language', 'vi')
        .send({
          title: 'Work item with bad state',
          description: 'Desc',
          idempotencyKey: crypto.randomUUID(),
          stateId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(409);

      expect(res.headers['content-language']).toBe('vi');
      expect(res.body.code).toBe('STATE_UNAVAILABLE');
      expect(res.body.message).toBe(
        'Trạng thái này không còn dùng được. Hãy chọn trạng thái khác.',
      );
    });
  });
});
