
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_PERMISSION_KEY } from '../../workspaces/workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../../workspaces/workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../../workspaces/workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from '../../workspaces/workspaceWriteRateLimitGuard.js';
import {
  projectReadGuards,
  ProjectRead,
  ProjectWrite,
} from './projectAccess.decorator.js';
import { ProjectAccessGuard } from './projectAccessGuard.js';
import {
  PROJECT_PERMISSION_KEY,
  ProjectPermissionGuard,
} from './projectPermissionGuard.js';

describe('ProjectAccess decorators (BA ADR-04, ADR-07, API B3, B7, INV-02)', () => {
  describe('ProjectRead (4 forms)', () => {
    it('1. ProjectRead without permission attaches member and project access guards', () => {
      class TestController {
        @ProjectRead()
        get() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'get',
      )!;

      const projectPerm = Reflect.getMetadata(
        PROJECT_PERMISSION_KEY,
        descriptor.value,
      );
      const wsPerm = Reflect.getMetadata(
        WORKSPACE_PERMISSION_KEY,
        descriptor.value,
      );
      expect(projectPerm).toBeUndefined();
      expect(wsPerm).toBeUndefined();

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([WorkspaceMemberGuard, ProjectAccessGuard]);
    });

    it('2. ProjectRead with project permission attaches project permission guard in order', () => {
      class TestController {
        @ProjectRead('project.members.view')
        getMembers() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'getMembers',
      )!;

      const projectPerm = Reflect.getMetadata(
        PROJECT_PERMISSION_KEY,
        descriptor.value,
      );
      expect(projectPerm).toBe('project.members.view');
      expect(
        Reflect.getMetadata(WORKSPACE_PERMISSION_KEY, descriptor.value),
      ).toBeUndefined();

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
      ]);
    });

    it('3. ProjectRead with workspace requirement attaches workspace permission guard in order', () => {
      class TestController {
        @ProjectRead({ workspace: 'workspace.members.email.view' })
        getWithEmail() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'getWithEmail',
      )!;

      expect(
        Reflect.getMetadata(PROJECT_PERMISSION_KEY, descriptor.value),
      ).toBeUndefined();
      const wsPerm = Reflect.getMetadata(
        WORKSPACE_PERMISSION_KEY,
        descriptor.value,
      );
      expect(wsPerm).toBe('workspace.members.email.view');

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        WorkspacePermissionGuard,
      ]);
    });

    it('4. ProjectRead with dual requirement attaches both permission guards in order', () => {
      class TestController {
        @ProjectRead({
          project: 'project.members.view',
          workspace: 'workspace.members.email.view',
        })
        getDual() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'getDual',
      )!;

      const projectPerm = Reflect.getMetadata(
        PROJECT_PERMISSION_KEY,
        descriptor.value,
      );
      const wsPerm = Reflect.getMetadata(
        WORKSPACE_PERMISSION_KEY,
        descriptor.value,
      );
      expect(projectPerm).toBe('project.members.view');
      expect(wsPerm).toBe('workspace.members.email.view');

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
        WorkspacePermissionGuard,
      ]);
    });
  });

  describe('ProjectWrite (3 forms)', () => {
    it('1. ProjectWrite with project permission attaches project permission metadata and guards in order (identical to legacy)', () => {
      class TestController {
        @ProjectWrite('project.settings.update')
        update() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'update',
      )!;

      const projectPerm = Reflect.getMetadata(
        PROJECT_PERMISSION_KEY,
        descriptor.value,
      );
      expect(projectPerm).toBe('project.settings.update');

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceWriteRateLimitGuard,
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
      ]);
    });

    it('2. ProjectWrite with workspace requirement attaches workspace permission metadata and guards in order (identical to legacy)', () => {
      class TestController {
        @ProjectWrite({ workspace: 'workspace.projects.delete' })
        delete() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'delete',
      )!;

      const wsPerm = Reflect.getMetadata(
        WORKSPACE_PERMISSION_KEY,
        descriptor.value,
      );
      expect(wsPerm).toBe('workspace.projects.delete');

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceWriteRateLimitGuard,
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        WorkspacePermissionGuard,
      ]);
    });

    it('3. ProjectWrite with dual requirement attaches both permission metadata and guards in order', () => {
      class TestController {
        @ProjectWrite({
          project: 'project.settings.update',
          workspace: 'workspace.members.add',
        })
        addMembers() {}
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'addMembers',
      )!;

      const projectPerm = Reflect.getMetadata(
        PROJECT_PERMISSION_KEY,
        descriptor.value,
      );
      const wsPerm = Reflect.getMetadata(
        WORKSPACE_PERMISSION_KEY,
        descriptor.value,
      );
      expect(projectPerm).toBe('project.settings.update');
      expect(wsPerm).toBe('workspace.members.add');

      const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
      expect(guards).toEqual([
        WorkspaceWriteRateLimitGuard,
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
        WorkspacePermissionGuard,
      ]);
    });
  });

  describe('projectReadGuards helper', () => {
    it('returns base guards when requirement is undefined', () => {
      const def = projectReadGuards();
      expect(def.guards).toEqual([WorkspaceMemberGuard, ProjectAccessGuard]);
      expect(def.projectPermission).toBeUndefined();
      expect(def.workspacePermission).toBeUndefined();
    });

    it('returns project permission guard for string requirement', () => {
      const def = projectReadGuards('project.members.view');
      expect(def.guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
      ]);
      expect(def.projectPermission).toBe('project.members.view');
      expect(def.workspacePermission).toBeUndefined();
    });

    it('returns workspace permission guard for workspace requirement', () => {
      const def = projectReadGuards({ workspace: 'workspace.members.add' });
      expect(def.guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        WorkspacePermissionGuard,
      ]);
      expect(def.projectPermission).toBeUndefined();
      expect(def.workspacePermission).toBe('workspace.members.add');
    });

    it('returns both permission guards for dual requirement', () => {
      const def = projectReadGuards({
        project: 'project.members.view',
        workspace: 'workspace.members.add',
      });
      expect(def.guards).toEqual([
        WorkspaceMemberGuard,
        ProjectAccessGuard,
        ProjectPermissionGuard,
        WorkspacePermissionGuard,
      ]);
      expect(def.projectPermission).toBe('project.members.view');
      expect(def.workspacePermission).toBe('workspace.members.add');
    });
  });

  it('guarantees ProjectAccessGuard precedes any permission guard in all forms', () => {
    const cases = [
      projectReadGuards('project.members.view'),
      projectReadGuards({ workspace: 'workspace.members.add' }),
      projectReadGuards({
        project: 'project.members.view',
        workspace: 'workspace.members.add',
      }),
    ];

    for (const def of cases) {
      const accessIndex = def.guards.indexOf(ProjectAccessGuard);
      expect(accessIndex).toBeGreaterThan(-1);

      if (def.guards.includes(ProjectPermissionGuard)) {
        const projPermIndex = def.guards.indexOf(ProjectPermissionGuard);
        expect(projPermIndex).toBeGreaterThan(accessIndex);
      }
      if (def.guards.includes(WorkspacePermissionGuard)) {
        const wsPermIndex = def.guards.indexOf(WorkspacePermissionGuard);
        expect(wsPermIndex).toBeGreaterThan(accessIndex);
      }
    }
  });
});

