import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_LIST_MAX,
  PROJECT_MEMBER_PREVIEW_MAX,
  type ProjectIcon,
  type ProjectRole,
} from '@repo/contracts';


import { FakeClock } from '../../test/fakes/authFakes.js';
import {
  FakeProjectAccessResolver,
  FakeProjectEvents,
  FakeProjectsRepository,
} from '../../test/fakes/projectsFakes.js';
import { makeMemberWorkspace } from '../../test/fakes/workspacesFakes.js';
import { ApiException } from '../common/apiException.js';
import type { AccessibleProject } from './access/projectAccessResolver.js';
import type { ProjectRow } from './dto/projectResponse.js';
import {
  ProjectIdentifierTakenError,
  ProjectNameTakenError,
} from './projectErrors.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  function makeProjectRow(overrides: Partial<ProjectRow> = {}): ProjectRow {
    return {
      id: 'p-1',
      name: 'Project One',
      identifier: 'PO',
      description: 'Desc',
      iconName: DEFAULT_PROJECT_ICON,
      iconColor: DEFAULT_PROJECT_ICON_COLOR,
      coverKey: DEFAULT_PROJECT_COVER,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      timezone: null,
      ...overrides,
    };
  }

  function makeSetup() {
    const repository = new FakeProjectsRepository();
    const resolver = new FakeProjectAccessResolver();
    const clock = new FakeClock();
    const events = new FakeProjectEvents();
    const service = new ProjectsService(repository, resolver, clock, events);
    return { service, repository, resolver, clock, events };
  }

  describe('list', () => {
    it('returns empty list when no projects accessible', async () => {
      const { service } = makeSetup();
      const ws = makeMemberWorkspace();
      const res = await service.list(ws, 'user-1');

      expect(res.projects).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.truncated).toBe(false);
    });

    it('returns project list with members when viewer has project.members.view (AC-09, AC-10)', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace({
        permissions: ['workspace.members.email.view'],
      });

      resolver.rows = [
        {
          project: makeProjectRow({
            id: 'p-1',
            name: 'Project One',
            identifier: 'PO',
            description: 'Desc',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date('2026-10-01T00:00:00Z'),
          }),
          access: {
            role: 'admin',
            permissions: ['project.members.view'],
          },
        },
      ];

      repository.membersByProjectId.set('p-1', [
        {
          projectId: 'p-1',
          userId: 'u-1',
          addedAt: new Date('2026-10-01T00:00:00Z'),
          firstName: 'An',
          lastName: 'Nguyen',
          displayName: 'an',
          email: 'an@example.com',
          accountActive: true,
        },
      ]);

      const res = await service.list(ws, 'u-1');
      expect(res.total).toBe(1);
      expect(res.projects[0]!.name).toBe('Project One');
      expect(res.projects[0]!.members).toHaveLength(1);
      expect(res.projects[0]!.members![0]!.email).toBe('an@example.com');
      expect(res.projects[0]!.permissions).toEqual(['project.members.view']);
    });

    it('sets members: null and does not query members when lacking project.members.view (AC-14)', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace();

      resolver.rows = [
        {
          project: makeProjectRow({
            id: 'p-guest',
            name: 'Guest Project',
            identifier: 'GP',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date('2026-10-01T00:00:00Z'),
          }),
          access: {
            role: 'guest',
            permissions: [],
          },
        },
      ];

      const res = await service.list(ws, 'u-guest');
      expect(res.projects[0]!.members).toBeNull();
      expect(res.projects[0]!.memberCount).toBeNull();
      expect(repository.lastMembersOfQuery).toBeUndefined();
    });

    it('reports the real total when the list is cut at PROJECT_LIST_MAX (R-4)', async () => {
      const { service, resolver, events } = makeSetup();
      const ws = makeMemberWorkspace();

      resolver.rows = Array.from({ length: PROJECT_LIST_MAX }, (_, i) => ({
        project: makeProjectRow({
          id: `p-${i}`,
          name: `Project ${i}`,
          identifier: 'P',
          description: '',
          iconName: DEFAULT_PROJECT_ICON,
          iconColor: DEFAULT_PROJECT_ICON_COLOR,
          coverKey: DEFAULT_PROJECT_COVER,
          createdAt: new Date(),
        }),
        access: { role: 'admin' as const, permissions: [] },
      }));
      resolver.total = 5000;

      const res = await service.list(ws, 'u-admin', 'req-123');
      expect(res.projects).toHaveLength(PROJECT_LIST_MAX);
      expect(res.total).toBe(5000);
      expect(res.truncated).toBe(true);
      expect(events.truncatedEvents).toHaveLength(1);
      expect(events.truncatedEvents[0]!.count).toBe(5000);
    });

    it('asks for at most PROJECT_MEMBER_PREVIEW_MAX members and returns the real memberCount', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace();

      resolver.rows = [
        {
          project: makeProjectRow({
            id: 'p-big',
            name: 'Big',
            identifier: 'BIG',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date(),
          }),
          access: { role: 'admin', permissions: ['project.members.view'] },
        },
      ];
      repository.membersByProjectId.set(
        'p-big',
        Array.from({ length: 300 }, (_, i) => ({
          projectId: 'p-big',
          userId: `u-${String(i).padStart(3, '0')}`,
          addedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
          firstName: '',
          lastName: '',
          displayName: `user ${i}`,
          accountActive: true,
        })),
      );

      const res = await service.list(ws, 'u-000');
      expect(repository.lastMembersOfQuery?.opts.limitPerProject).toBe(
        PROJECT_MEMBER_PREVIEW_MAX,
      );
      expect(res.projects[0]!.members).toHaveLength(PROJECT_MEMBER_PREVIEW_MAX);
      expect(res.projects[0]!.memberCount).toBe(300);
      // Repository order is kept (no re-sort in the mapper).
      expect(res.projects[0]!.members![0]!.userId).toBe('u-000');
    });

    it('returns memberCount 0 and an empty list for a visible project without active members', async () => {
      const { service, resolver } = makeSetup();
      resolver.rows = [
        {
          project: makeProjectRow({
            id: 'p-empty',
            name: 'Empty',
            identifier: 'EMP',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date(),
          }),
          access: { role: 'admin', permissions: ['project.members.view'] },
        },
      ];

      const res = await service.list(makeMemberWorkspace(), 'u-1');
      expect(res.projects[0]!.members).toEqual([]);
      expect(res.projects[0]!.memberCount).toBe(0);
    });

    it('excludes email key when viewer lacks workspace.members.email.view (AC-13)', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace({
        permissions: [], // no workspace.members.email.view
      });

      resolver.rows = [
        {
          project: makeProjectRow({
            id: 'p-1',
            name: 'P1',
            identifier: 'P',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date(),
          }),
          access: {
            role: 'contributor' as const,
            permissions: ['project.members.view'],
          },
        },
      ];

      repository.membersByProjectId.set('p-1', [
        {
          projectId: 'p-1',
          userId: 'u-1',
          addedAt: new Date(),
          firstName: 'Nam',
          lastName: 'Le',
          displayName: 'nam',
          email: 'nam@example.com',
          accountActive: true,
        },
      ]);

      const res = await service.list(ws, 'u-1');
      expect(res.projects[0]!.members![0]).not.toHaveProperty('email');
    });
  });

  describe('create', () => {
    it('creates project, emits event, and returns toProjectListItem', async () => {
      const { service, repository, resolver, events } = makeSetup();
      const ws = makeMemberWorkspace();

      resolver.project = {
        project: makeProjectRow({
          id: 'project-new-id',
          name: 'New Project',
          identifier: 'NP',
          description: 'A new one',
          iconName: DEFAULT_PROJECT_ICON,
          iconColor: DEFAULT_PROJECT_ICON_COLOR,
          coverKey: DEFAULT_PROJECT_COVER,
          createdAt: new Date('2026-10-11T12:00:00Z'),
        }),
        access: {
          role: 'admin',
          permissions: ['project.members.view'],
        },
      };

      const res = await service.create(
        ws,
        'u-creator',
        {
          name: 'New Project',
          identifier: 'NP',
          description: 'A new one',
          icon: {
            name: DEFAULT_PROJECT_ICON,
            color: DEFAULT_PROJECT_ICON_COLOR,
          },
          coverKey: DEFAULT_PROJECT_COVER,
        },
        'req-create-1',
      );

      expect(res.project.id).toBe('project-new-id');
      expect(res.project.name).toBe('New Project');
      expect(resolver.lastInput).toEqual({
        workspaceId: ws.id,
        userId: 'u-creator',
        workspaceRole: ws.role,
        projectId: 'project-new-id',
      });
      expect(repository.createdProjects).toHaveLength(1);
      expect(events.createdEvents).toHaveLength(1);
      expect(events.createdEvents[0]!.projectId).toBe('project-new-id');
    });

    it('defaults description to empty string when omitted', async () => {
      const { service, repository, resolver } = makeSetup();
      const ws = makeMemberWorkspace();
      resolver.project = {
        project: makeProjectRow({
          id: 'p-default',
          name: 'Default',
          identifier: 'DEF',
          description: '',
          iconName: DEFAULT_PROJECT_ICON,
          iconColor: DEFAULT_PROJECT_ICON_COLOR,
          coverKey: DEFAULT_PROJECT_COVER,
          createdAt: new Date(),
        }),
        access: {
          role: 'admin',
          permissions: ['project.members.view'],
        },
      };

      await service.create(ws, 'u-1', {
        name: 'Default',
        identifier: 'DEF',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      });

      expect(repository.createdProjects[0]!.description).toBe('');
    });

    it('translates ProjectNameTakenError into 409 ApiException (AC-05)', async () => {
      const { service, repository } = makeSetup();
      const ws = makeMemberWorkspace();
      repository.create = async () => {
        throw new ProjectNameTakenError();
      };

      await expect(
        service.create(ws, 'u-1', {
          name: 'Existing',
          identifier: 'EX',
          icon: {
            name: DEFAULT_PROJECT_ICON,
            color: DEFAULT_PROJECT_ICON_COLOR,
          },
          coverKey: DEFAULT_PROJECT_COVER,
        }),
      ).rejects.toThrow(ApiException);
    });

    it('translates ProjectIdentifierTakenError into 409 ApiException (AC-05)', async () => {
      const { service, repository } = makeSetup();
      const ws = makeMemberWorkspace();
      repository.create = async () => {
        throw new ProjectIdentifierTakenError();
      };

      await expect(
        service.create(ws, 'u-1', {
          name: 'New Name',
          identifier: 'TAKEN',
          icon: {
            name: DEFAULT_PROJECT_ICON,
            color: DEFAULT_PROJECT_ICON_COLOR,
          },
          coverKey: DEFAULT_PROJECT_COVER,
        }),
      ).rejects.toThrow(ApiException);
    });
  });

  describe('get', () => {
    function accessible(
      permissions: AccessibleProject['access']['permissions'],
      role: AccessibleProject['access']['role'] = 'admin',
    ): AccessibleProject {
      return {
        project: makeProjectRow({
          id: 'p-1',
          name: 'Project One',
          identifier: 'PROJ1',
          description: 'Desc',
          iconName: DEFAULT_PROJECT_ICON,
          iconColor: DEFAULT_PROJECT_ICON_COLOR,
          coverKey: DEFAULT_PROJECT_COVER,
          createdAt: new Date('2026-10-01T00:00:00Z'),
        }),
        access: { role, permissions },
      };
    }

    it('returns project item matching toProjectListItem on success (AC-24)', async () => {
      const { service, repository } = makeSetup();
      const ws = makeMemberWorkspace({
        permissions: ['workspace.members.email.view'],
      });

      repository.membersByProjectId.set('p-1', [
        {
          projectId: 'p-1',
          userId: 'u-1',
          addedAt: new Date('2026-10-01T00:00:00Z'),
          firstName: 'An',
          lastName: 'Nguyen',
          displayName: 'an',
          email: 'an@example.com',
          accountActive: true,
        },
      ]);

      const res = await service.get(ws, accessible(['project.members.view']));
      expect(res.project.id).toBe('p-1');
      expect(res.project.name).toBe('Project One');
      expect(res.project.identifier).toBe('PROJ1');
      expect(res.project.role).toBe('admin');
      expect(res.project.members).toHaveLength(1);
      expect(res.project.members![0]!.email).toBe('an@example.com');
    });

    it('sets members: null when viewer lacks project.members.view (AC-27)', async () => {
      const { service, repository } = makeSetup();
      const ws = makeMemberWorkspace();

      const res = await service.get(ws, accessible([], 'guest'));
      expect(res.project.members).toBeNull();
      expect(repository.lastMembersOfQuery).toBeUndefined();
    });
  });

  describe('update (API B4.2, B11.1)', () => {
    function accessible(
      rowOverrides: Partial<ProjectRow> = {},
      permissions: readonly string[] = ['project.members.view'],
      role: ProjectRole = 'admin',
    ): AccessibleProject {

      return {
        project: makeProjectRow(rowOverrides),
        access: { role, permissions },
      };
    }

    it('rejects empty update with 400 VALIDATION_ERROR Nothing to update', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible();

      await expect(
        service.update(ws, current, 'actor-1', {}),
      ).rejects.toThrow('Nothing to update');

      expect(resolver.lastInput).toBeUndefined();
      expect(repository.updatedProjects).toHaveLength(0);
    });

    it('(a) updates only name: repository receives { name } and resolver is not called (INV-01)', async () => {
      const { service, repository, resolver, events, clock } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({ name: 'Old Name' });
      const updatedRow = makeProjectRow({
        name: 'New Name',
        updatedAt: clock.now(),
      });
      repository.updateResult = updatedRow;

      const res = await service.update(
        ws,
        current,
        'actor-1',
        { name: 'New Name' },
        'req-123',
      );

      expect(res.project.name).toBe('New Name');
      expect(repository.updatedProjects).toHaveLength(1);
      expect(repository.updatedProjects[0]!.changes).toEqual({
        name: 'New Name',
      });
      expect(resolver.lastInput).toBeUndefined();
      expect(events.updatedEvents).toEqual([
        {
          projectId: 'p-1',
          workspaceId: ws.id,
          actorId: 'actor-1',
          requestId: 'req-123',
          fields: ['name'],
        },
      ]);
    });

    it('(b) when values are identical to current, does not call repository or log (RQ AC-22, INV-01)', async () => {
      const { service, repository, resolver, events } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({ name: 'Same Name', description: 'Same Desc' });

      const res = await service.update(ws, current, 'actor-1', {
        name: 'Same Name',
        description: 'Same Desc',
      });

      expect(res.project.name).toBe('Same Name');
      expect(repository.updatedProjects).toHaveLength(0);
      expect(events.updatedEvents).toHaveLength(0);
      expect(resolver.lastInput).toBeUndefined();
    });

    it('(c) when only icon color changes: repository receives both iconName and iconColor; unchanged icon case does not write', async () => {
      const { service, repository, resolver, events, clock } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({
        iconName: 'star',
        iconColor: '#FAB005',
      });
      const updatedRow = makeProjectRow({
        iconName: 'star',
        iconColor: '#FF0000',
        updatedAt: clock.now(),
      });
      repository.updateResult = updatedRow;

      const res = await service.update(ws, current, 'actor-1', {
        icon: { name: 'star', color: '#FF0000' } as ProjectIcon,
      });

      expect(res.project.icon.color).toBe('#FF0000');
      expect(repository.updatedProjects).toHaveLength(1);
      expect(repository.updatedProjects[0]!.changes).toEqual({
        iconName: 'star',
        iconColor: '#FF0000',
      });
      expect(events.updatedEvents).toHaveLength(1);
      expect(events.updatedEvents[0]!.fields).toEqual(['icon']);
      expect(resolver.lastInput).toBeUndefined();

      // Case-insensitive / unchanged icon does not write
      const currentIdentical = accessible({
        iconName: 'star',
        iconColor: '#FAB005',
      });
      const resIdentical = await service.update(ws, currentIdentical, 'actor-1', {
        icon: { name: 'star', color: '#FAB005' } as ProjectIcon,
      });

      expect(resIdentical.project.icon.name).toBe('star');
      expect(repository.updatedProjects).toHaveLength(1); // Still 1 from before
    });

    it('(d) updates timezone: null when current is Asia/Tokyo', async () => {
      const { service, repository, resolver, events, clock } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({ timezone: 'Asia/Tokyo' });
      const updatedRow = makeProjectRow({
        timezone: null,
        updatedAt: clock.now(),
      });
      repository.updateResult = updatedRow;

      const res = await service.update(ws, current, 'actor-1', {
        timezone: null,
      });

      expect(res.project.timezone).toBeNull();
      expect(repository.updatedProjects).toHaveLength(1);
      expect(repository.updatedProjects[0]!.changes).toEqual({
        timezone: null,
      });
      expect(events.updatedEvents).toHaveLength(1);
      expect(events.updatedEvents[0]!.fields).toEqual(['timezone']);
      expect(resolver.lastInput).toBeUndefined();
    });

    it('(e) maps ProjectNameTakenError from repository to 409 PROJECT_NAME_TAKEN with fields.name', async () => {
      const { service, repository, resolver } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({ name: 'Old Name' });
      repository.updateError = new ProjectNameTakenError();

      await expect(
        service.update(ws, current, 'actor-1', { name: 'Existing Name' }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'PROJECT_NAME_TAKEN',
        fields: { name: 'A project with this name already exists' },
      });
      expect(resolver.lastInput).toBeUndefined();
    });

    it('(f) throws 404 PROJECT_NOT_FOUND when repository returns null', async () => {
      const { service, repository, resolver } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible();
      repository.updateResult = null;

      await expect(
        service.update(ws, current, 'actor-1', { name: 'New Name' }),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
      expect(resolver.lastInput).toBeUndefined();
    });

    it('(g) event logging error does not fail update response', async () => {
      const { service, repository, events, clock } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible({ name: 'Old' });
      repository.updateResult = makeProjectRow({
        name: 'New',
        updatedAt: clock.now(),
      });
      events.updated = async () => {
        throw new Error('Logger crashed');
      };

      const res = await service.update(ws, current, 'actor-1', { name: 'New' });
      expect(res.project.name).toBe('New');
    });
  });

  describe('delete', () => {
    function accessible(
      projectOverrides: Partial<ProjectRow> = {},
    ): AccessibleProject {
      return {
        project: makeProjectRow(projectOverrides),
        access: {
          role: 'admin',
          permissions: ['project.settings.view', 'project.settings.update'],
        },
      };
    }

    it('soft deletes project, emits project.deleted event, and does not invoke resolver', async () => {
      const { service, repository, resolver, events, clock } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible();
      repository.softDeleteResult = true;

      await service.delete(ws, current, 'actor-1', 'req-123');

      expect(repository.softDeletedProjects).toEqual([
        {
          projectId: current.project.id,
          workspaceId: ws.id,
          actorId: 'actor-1',
          now: clock.now(),
        },
      ]);
      expect(events.deletedEvents).toEqual([
        {
          projectId: current.project.id,
          workspaceId: ws.id,
          actorId: 'actor-1',
          requestId: 'req-123',
        },
      ]);
      expect(resolver.lastInput).toBeUndefined();
    });

    it('throws 404 PROJECT_NOT_FOUND when repository softDelete returns false', async () => {
      const { service, repository, resolver } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible();
      repository.softDeleteResult = false;

      await expect(
        service.delete(ws, current, 'actor-1'),
      ).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
      expect(resolver.lastInput).toBeUndefined();
    });

    it('event logging error does not fail delete response', async () => {
      const { service, repository, events } = makeSetup();
      const ws = makeMemberWorkspace();
      const current = accessible();
      repository.softDeleteResult = true;
      events.deleted = async () => {
        throw new Error('Logger crashed');
      };

      await expect(
        service.delete(ws, current, 'actor-1'),
      ).resolves.toBeUndefined();
    });
  });
});

