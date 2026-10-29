import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { SessionGuard } from './auth/guards/sessionGuard.js';
import { ALLOW_RESET_ONLY_KEY } from './auth/currentUser.decorator.js';
import { MyPasswordChangeRateLimitGuard } from './users/myPasswordChangeRateLimitGuard.js';
import { ProjectAccessGuard } from './projects/access/projectAccessGuard.js';
import {
  PROJECT_PERMISSION_KEY,
  ProjectPermissionGuard,
} from './projects/access/projectPermissionGuard.js';
import { WRITE_LIMIT_KEY, type WriteLimit } from './common/writeLimit.js';
import { WORKSPACE_PERMISSION_KEY } from './workspaces/workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from './workspaces/workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from './workspaces/workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from './workspaces/workspaceWriteRateLimitGuard.js';
import { MemberCandidateRateLimitGuard } from './workspaces/members/memberCandidateRateLimitGuard.js';
import { AdminUsersController } from './admin/adminUsers.controller.js';
import { InstanceAdminGuard } from './admin/instanceAdminGuard.js';
import { UserCreateRateLimitGuard } from './admin/userCreateRateLimitGuard.js';
import {
  AdminUsersReadRateLimitGuard,
  AdminUsersWriteRateLimitGuard,
} from './admin/adminUsersRateLimitGuards.js';

/**
 * Fitness functions: rules that every endpoint, present and future, must keep.
 * They turn review findings (CLAUDE.md §8 design pass) into red tests.
 */

const SRC = join(import.meta.dirname);

/** Routes reachable without a session. Adding one is a security decision. */
const PUBLIC_ROUTES = new Set([
  'GET /',
  'GET /health',
  'GET /auth/session',
  'POST /auth/sign-in',
  'POST /auth/sign-out',
]);

interface Route {
  key: string;
  path: string;
  guards: unknown[];
  projectPermission?: unknown;
  workspacePermission?: unknown;
  writeLimit?: unknown;
  allowsResetOnly?: boolean;
}

function sourceFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(suffix))
    .map((e) => join(e.parentPath, e.name));
}

function joinPath(...parts: (string | undefined)[]): string {
  const joined = parts
    .filter((p): p is string => p !== undefined && p !== '' && p !== '/')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .join('/');
  return `/${joined}`;
}

async function collectRoutes(): Promise<Route[]> {
  const routes: Route[] = [];
  for (const file of sourceFiles(SRC, '.controller.ts')) {
    const mod: Record<string, unknown> = await import(file);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const classPath: unknown = Reflect.getMetadata(PATH_METADATA, exported);
      if (typeof classPath !== 'string') continue;
      const classGuards: unknown[] =
        Reflect.getMetadata(GUARDS_METADATA, exported) ?? [];

      const proto = (exported as { prototype: Record<string, unknown> })
        .prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        if (typeof methodPath !== 'string') continue;
        const method: RequestMethod =
          Reflect.getMetadata(METHOD_METADATA, handler) ?? RequestMethod.GET;
        const path = joinPath(classPath, methodPath);
        routes.push({
          key: `${RequestMethod[method]} ${path}`,
          path,
          guards: [
            ...classGuards,
            ...((Reflect.getMetadata(GUARDS_METADATA, handler) as
              unknown[] | undefined) ?? []),
          ],
          projectPermission: Reflect.getMetadata(
            PROJECT_PERMISSION_KEY,
            handler,
          ),
          workspacePermission: Reflect.getMetadata(
            WORKSPACE_PERMISSION_KEY,
            handler,
          ),
          writeLimit: Reflect.getMetadata(WRITE_LIMIT_KEY, handler),
          allowsResetOnly:
            (Reflect.getMetadata(ALLOW_RESET_ONLY_KEY, handler) ??
              Reflect.getMetadata(ALLOW_RESET_ONLY_KEY, exported) ??
              false) === true,
        });
      }
    }
  }
  return routes;
}

describe('Architecture', () => {
  let routes: Route[];

  beforeAll(async () => {
    routes = await collectRoutes();
  });

  it('finds the controllers it checks', () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.map((r) => r.key)).toContain(
      'GET /workspaces/:slug/projects/:identifier',
    );
    expect(routes.map((r) => r.key)).toContain(
      'PATCH /workspaces/:slug/projects/:identifier',
    );
  });

  it('authenticates every route outside the public allowlist (OWASP A01)', () => {
    const open = routes
      .filter((r) => !r.guards.includes(SessionGuard))
      .map((r) => r.key);
    expect(open.filter((k) => !PUBLIC_ROUTES.has(k))).toEqual([]);
    // A stale entry would silently allow a future route with that name.
    expect([...PUBLIC_ROUTES].filter((k) => !open.includes(k))).toEqual([]);
  });

  it('loads the workspace membership for every route under /workspaces/:slug', () => {
    const missing = routes
      .filter(
        (r) =>
          r.path.startsWith('/workspaces/:slug') &&
          !r.guards.includes(WorkspaceMemberGuard),
      )
      .map((r) => r.key);
    expect(missing).toEqual([]);
  });

  it('opens every project-scoped route through ProjectAccessGuard (ProjectRead/ProjectWrite)', () => {
    const missing = routes
      .filter(
        (r) =>
          r.path.includes('/projects/:') &&
          !r.guards.includes(ProjectAccessGuard),
      )
      .map((r) => r.key);
    expect(missing).toEqual([]);
  });

  it('enforces rate limit and permission guard after ProjectAccessGuard on non-GET project routes (INV-02, AC-45)', () => {
    const nonGetProjectRoutes = routes.filter(
      (r) => !r.key.startsWith('GET ') && r.path.includes('/projects/:'),
    );
    expect(nonGetProjectRoutes.length).toBeGreaterThan(0);

    for (const route of nonGetProjectRoutes) {
      expect(route.guards).toContain(WorkspaceWriteRateLimitGuard);
      expect(route.guards).toContain(ProjectAccessGuard);

      const hasPermGuard =
        route.guards.includes(ProjectPermissionGuard) ||
        route.guards.includes(WorkspacePermissionGuard);
      expect(hasPermGuard).toBe(true);

      const accessIndex = route.guards.indexOf(ProjectAccessGuard);
      const permIndex = route.guards.findIndex(
        (g) => g === ProjectPermissionGuard || g === WorkspacePermissionGuard,
      );
      expect(permIndex).toBeGreaterThan(accessIndex);
    }
  });

  it('decides project access only in the resolver, its guard and the list/create flow', () => {
    const allowed = new Set([
      'projects/access/projectAccessResolver.ts',
      'projects/access/projectAccessGuard.ts',
      'projects/projects.service.ts',
    ]);
    const callers = sourceFiles(SRC, '.ts')
      .filter((f) => !f.endsWith('.spec.ts'))
      .filter((f) =>
        /\.(forIdentifier|forProject|forWorkspace)\(/.test(
          readFileSync(f, 'utf8'),
        ),
      )
      .map((f) => relative(SRC, f));
    expect(callers.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it('places MemberCandidateRateLimitGuard before WorkspaceMemberGuard on candidate search routes (INV-15)', () => {
    const candidateRoutes = routes.filter((r) =>
      r.guards.includes(MemberCandidateRateLimitGuard),
    );
    expect(candidateRoutes.length).toBeGreaterThan(0);
    for (const route of candidateRoutes) {
      expect(route.guards).toContain(WorkspaceMemberGuard);
      const rateLimitIndex = route.guards.indexOf(
        MemberCandidateRateLimitGuard,
      );
      const memberIndex = route.guards.indexOf(WorkspaceMemberGuard);
      expect(rateLimitIndex).toBeLessThan(memberIndex);
    }
  });

  it('enforces both permission guards in order after ProjectAccessGuard on routes with dual permission metadata (API B3)', () => {
    const dualRoutes = routes.filter(
      (r) => r.projectPermission && r.workspacePermission,
    );
    for (const route of dualRoutes) {
      expect(route.guards).toContain(ProjectAccessGuard);
      expect(route.guards).toContain(ProjectPermissionGuard);
      expect(route.guards).toContain(WorkspacePermissionGuard);

      const accessIndex = route.guards.indexOf(ProjectAccessGuard);
      const projPermIndex = route.guards.indexOf(ProjectPermissionGuard);
      const wsPermIndex = route.guards.indexOf(WorkspacePermissionGuard);

      expect(projPermIndex).toBeGreaterThan(accessIndex);
      expect(wsPermIndex).toBeGreaterThan(accessIndex);
      expect(wsPermIndex).toBeGreaterThan(projPermIndex);
    }
  });

  it('prohibits write routes matching access-polic (API B9.3)', () => {
    const policyWriteRoutes = routes.filter(
      (r) => r.path.includes('access-polic') && !r.key.startsWith('GET '),
    );
    expect(policyWriteRoutes).toEqual([]);
  });

  it('defines no class-level guards on AdminUsersController (RQ INV-01)', () => {
    const classGuards =
      Reflect.getMetadata(GUARDS_METADATA, AdminUsersController) ?? [];
    expect(classGuards).toEqual([]);
  });

  it('enforces exact guard chain on every admin/users route: SessionGuard -> RateLimiter -> InstanceAdminGuard (RQ INV-01)', () => {
    const adminUsersRoutes = routes.filter((r) =>
      r.path.startsWith('/admin/users'),
    );
    expect(adminUsersRoutes.length).toBeGreaterThan(0);

    const allowedLimiters = [
      UserCreateRateLimitGuard,
      AdminUsersReadRateLimitGuard,
      AdminUsersWriteRateLimitGuard,
    ];

    for (const route of adminUsersRoutes) {
      expect(route.guards).toHaveLength(3);
      expect(route.guards[0]).toBe(SessionGuard);
      expect(allowedLimiters).toContain(route.guards[1]);
      expect(route.guards[2]).toBe(InstanceAdminGuard);
    }
  });

  it('allows reset-only sessions exclusively on PUT /users/me/password with exact guard chain (AC-11)', () => {
    const resetOnlyRoutes = routes.filter((r) => r.allowsResetOnly);
    expect(resetOnlyRoutes.map((r) => r.key)).toEqual([
      'PUT /users/me/password',
    ]);
    const route = resetOnlyRoutes[0];
    expect(route?.guards).toEqual([
      SessionGuard,
      MyPasswordChangeRateLimitGuard,
    ]);
  });

  it('restricts work_item_create write limit exclusively to POST /workspaces/:slug/projects/:identifier/work-items (RQ R-07, AC-30)', () => {
    const routesWithWorkItemLimit = routes.filter(
      (r) =>
        (r.writeLimit as WriteLimit | undefined)?.bucket === 'work_item_create',
    );
    expect(routesWithWorkItemLimit.map((r) => r.key)).toEqual([
      'POST /workspaces/:slug/projects/:identifier/work-items',
    ]);
  });

  it('restricts state_write bucket exclusively to state routes and enforces it on all non-GET state routes (API B2.2)', () => {
    const isStateRoutePath = (path: string): boolean =>
      path === '/workspaces/:slug/states' ||
      path.startsWith('/workspaces/:slug/states/') ||
      path === '/workspaces/:slug/projects/:identifier/states' ||
      path.startsWith('/workspaces/:slug/projects/:identifier/states/');

    const routesWithStateLimit = routes.filter(
      (r) => (r.writeLimit as WriteLimit | undefined)?.bucket === 'state_write',
    );
    expect(routesWithStateLimit.length).toBeGreaterThan(0);
    for (const route of routesWithStateLimit) {
      expect(isStateRoutePath(route.path)).toBe(true);
    }

    const nonGetStateRoutes = routes.filter(
      (r) => !r.key.startsWith('GET ') && isStateRoutePath(r.path),
    );
    expect(nonGetStateRoutes.length).toBeGreaterThan(0);
    for (const route of nonGetStateRoutes) {
      expect((route.writeLimit as WriteLimit | undefined)?.bucket).toBe(
        'state_write',
      );
    }
  });
});
