import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_PERMISSION_KEY } from '../../workspaces/workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../../workspaces/workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../../workspaces/workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from '../../workspaces/workspaceWriteRateLimitGuard.js';
import {
  ProjectRead,
  ProjectWrite,
} from './projectAccess.decorator.js';
import { ProjectAccessGuard } from './projectAccessGuard.js';
import {
  PROJECT_PERMISSION_KEY,
  ProjectPermissionGuard,
} from './projectPermissionGuard.js';

describe('ProjectAccess decorators (BA ADR-04, API B7, INV-02)', () => {
  it('ProjectWrite with project permission attaches project permission metadata and guards in order', () => {
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

  it('ProjectWrite with workspace requirement attaches workspace permission metadata and guards in order', () => {
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

  it('ProjectRead without permission attaches member and project access guards', () => {
    class TestController {
      @ProjectRead()
      get() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'get',
    )!;

    const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
    expect(guards).toEqual([WorkspaceMemberGuard, ProjectAccessGuard]);
  });

  it('ProjectRead with permission attaches project permission guard in order', () => {
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

    const guards = Reflect.getMetadata(GUARDS_METADATA, descriptor.value);
    expect(guards).toEqual([
      WorkspaceMemberGuard,
      ProjectAccessGuard,
      ProjectPermissionGuard,
    ]);
  });
});
