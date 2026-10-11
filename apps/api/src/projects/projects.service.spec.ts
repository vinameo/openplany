import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_LIST_MAX,
} from '@repo/contracts';
import { FakeClock } from '../../test/fakes/authFakes.js';
import {
  FakeProjectAccessResolver,
  FakeProjectEvents,
  FakeProjectsRepository,
} from '../../test/fakes/projectsFakes.js';
import { makeMemberWorkspace } from '../../test/fakes/workspacesFakes.js';
import { ApiException } from '../common/apiException.js';
import {
  ProjectIdentifierTakenError,
  ProjectNameTakenError,
} from './projectErrors.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
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
          project: {
            id: 'p-1',
            name: 'Project One',
            identifier: 'PO',
            description: 'Desc',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date('2026-10-01T00:00:00Z'),
          },
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
          project: {
            id: 'p-guest',
            name: 'Guest Project',
            identifier: 'GP',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date('2026-10-01T00:00:00Z'),
          },
          access: {
            role: 'guest',
            permissions: [],
          },
        },
      ];

      const res = await service.list(ws, 'u-guest');
      expect(res.projects[0]!.members).toBeNull();
      expect(repository.lastMembersOfQuery).toBeUndefined();
    });

    it('truncates at PROJECT_LIST_MAX, marks truncated, and emits event (R-4)', async () => {
      const { service, resolver, events } = makeSetup();
      const ws = makeMemberWorkspace();

      const manyRows = [];
      for (let i = 0; i < PROJECT_LIST_MAX + 5; i++) {
        manyRows.push({
          project: {
            id: `p-${i}`,
            name: `Project ${i}`,
            identifier: 'P',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date(),
          },
          access: {
            role: 'admin' as const,
            permissions: ['project.members.view'],
          },
        });
      }
      resolver.rows = manyRows;

      const res = await service.list(ws, 'u-admin', 'req-123');
      expect(res.total).toBe(PROJECT_LIST_MAX);
      expect(res.truncated).toBe(true);
      expect(events.truncatedEvents).toHaveLength(1);
      expect(events.truncatedEvents[0]!.count).toBe(PROJECT_LIST_MAX + 5);
    });

    it('excludes email key when viewer lacks workspace.members.email.view (AC-13)', async () => {
      const { service, resolver, repository } = makeSetup();
      const ws = makeMemberWorkspace({
        permissions: [], // no workspace.members.email.view
      });

      resolver.rows = [
        {
          project: {
            id: 'p-1',
            name: 'P1',
            identifier: 'P',
            description: '',
            iconName: DEFAULT_PROJECT_ICON,
            iconColor: DEFAULT_PROJECT_ICON_COLOR,
            coverKey: DEFAULT_PROJECT_COVER,
            createdAt: new Date(),
          },
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
      const { service, repository, events } = makeSetup();
      const ws = makeMemberWorkspace();

      repository.accessibleProject = {
        project: {
          id: 'project-new-id',
          name: 'New Project',
          identifier: 'NP',
          description: 'A new one',
          iconName: DEFAULT_PROJECT_ICON,
          iconColor: DEFAULT_PROJECT_ICON_COLOR,
          coverKey: DEFAULT_PROJECT_COVER,
          createdAt: new Date('2026-10-11T12:00:00Z'),
        },
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
      expect(repository.createdProjects).toHaveLength(1);
      expect(events.createdEvents).toHaveLength(1);
      expect(events.createdEvents[0]!.projectId).toBe('project-new-id');
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
});
