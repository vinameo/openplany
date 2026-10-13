import { type ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
} from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AccessibleProject } from './projectAccessResolver.js';
import { ProjectPermissionGuard } from './projectPermissionGuard.js';

function accessible(
  permissions: AccessibleProject['access']['permissions'],
): AccessibleProject {
  return {
    project: {
      id: 'p-1',
      name: 'Project One',
      identifier: 'PROJ1',
      description: '',
      iconName: DEFAULT_PROJECT_ICON,
      iconColor: DEFAULT_PROJECT_ICON_COLOR,
      coverKey: DEFAULT_PROJECT_COVER,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      timezone: null,
    },
    access: { role: 'viewer', permissions },
  };
}

function makeContext(project: AccessibleProject | undefined): ExecutionContext {
  return {
    getHandler: () => () => {},
    switchToHttp: () => ({ getRequest: () => ({ project }) }),
  } as unknown as ExecutionContext;
}

describe('ProjectPermissionGuard', () => {
  it('throws a programming error without permission metadata', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    const guard = new ProjectPermissionGuard(reflector);

    expect(() => guard.canActivate(makeContext(accessible([])))).toThrow(
      'ProjectPermissionGuard used without a permission',
    );
  });

  it('throws a programming error when run before ProjectAccessGuard', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('project.members.view');
    const guard = new ProjectPermissionGuard(reflector);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      'ProjectPermissionGuard must run after ProjectAccessGuard',
    );
  });

  it('allows a project role that holds the permission', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('project.members.view');
    const guard = new ProjectPermissionGuard(reflector);

    expect(
      guard.canActivate(makeContext(accessible(['project.members.view']))),
    ).toBe(true);
  });

  it('throws 403 FORBIDDEN and warns when the project role lacks the permission', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('project.members.view');
    const guard = new ProjectPermissionGuard(reflector);

    expect(() => guard.canActivate(makeContext(accessible([])))).toThrow(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' }),
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
