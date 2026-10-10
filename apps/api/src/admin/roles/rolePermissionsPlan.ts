import {
  PERMISSION_GRANT_PROBLEM_MESSAGES,
  PROJECT_ROLES,
  WORKSPACE_ROLES,
  permissionGrantProblem,
  permissionRevokeProblem,
  scopeOfPermission,
  type ProjectRole,
  type RolePermissionsChange,
  type RoleRef,
  type RoleScope,
  type WorkspaceRole,
} from '@repo/contracts';

export interface StoredRolePermissions {
  scope: RoleScope;
  key: string;
  version: number;
  permissions: readonly string[];
}

export interface RolePermissionsEntry {
  scope: RoleScope;
  key: string;
  permission: string;
}

export type RolePermissionsPlan =
  | {
      status: 'ok';
      grants: RolePermissionsEntry[];
      revokes: RolePermissionsEntry[];
      changedRoles: RoleRef[];
    }
  | { status: 'invalid'; fields: Record<string, string> }
  | { status: 'conflict' };

function isValidRole(scope: RoleScope, key: string): boolean {
  if (scope === 'workspace') {
    return (WORKSPACE_ROLES as readonly string[]).includes(key);
  }
  if (scope === 'project') {
    return (PROJECT_ROLES as readonly string[]).includes(key);
  }
  return false;
}



export function planRolePermissionChanges(
  current: readonly StoredRolePermissions[],
  changes: readonly RolePermissionsChange[],
  validPermissions?: readonly string[] | Set<string>,
): RolePermissionsPlan {
  const currentMap = new Map<string, StoredRolePermissions>();
  for (const stored of current) {
    currentMap.set(`${stored.scope}.${stored.key}`, stored);
  }

  // 1. Validate roles: key must belong to scope, no duplicate (scope, key)
  const roleFields: Record<string, string> = {};
  const seenRoleKeys = new Set<string>();

  for (const change of changes) {
    const roleId = `${change.scope}.${change.key}`;
    if (!isValidRole(change.scope, change.key)) {
      roleFields[roleId] = 'Unknown role';
    } else if (seenRoleKeys.has(roleId)) {
      roleFields[roleId] = 'Listed more than once';
    } else {
      seenRoleKeys.add(roleId);
    }
  }

  if (Object.keys(roleFields).length > 0) {
    return { status: 'invalid', fields: roleFields };
  }

  const validSet = validPermissions
    ? (validPermissions instanceof Set ? validPermissions : new Set(validPermissions))
    : new Set(current.flatMap((c) => c.permissions));

  // 2. Validate permission names: must exist in catalog
  const permFields: Record<string, string> = {};
  for (const change of changes) {
    for (const perm of change.permissions) {
      if (scopeOfPermission(perm) === null || !validSet.has(perm)) {
        permFields[`${change.scope}.${change.key}:${perm}`] = 'Unknown permission';
      }
    }
  }

  if (Object.keys(permFields).length > 0) {
    return { status: 'invalid', fields: permFields };
  }

  // 3. Version check
  for (const change of changes) {
    const roleId = `${change.scope}.${change.key}`;
    const stored = currentMap.get(roleId);
    if (!stored || stored.version !== change.version) {
      return { status: 'conflict' };
    }
  }

  // 4. Guardrails on delta (added / removed permissions)
  const guardrailFields: Record<string, string> = {};
  const grants: RolePermissionsEntry[] = [];
  const revokes: RolePermissionsEntry[] = [];
  const changedRoles: RoleRef[] = [];

  for (const change of changes) {
    const roleId = `${change.scope}.${change.key}`;
    const stored = currentMap.get(roleId)!;
    const roleRef: RoleRef =
      change.scope === 'workspace'
        ? { scope: 'workspace', key: change.key as WorkspaceRole }
        : { scope: 'project', key: change.key as ProjectRole };

    const newPerms = new Set(change.permissions);
    const currPerms = new Set(stored.permissions);

    const added: string[] = [];
    for (const perm of newPerms) {
      if (!currPerms.has(perm)) {
        added.push(perm);
      }
    }

    const removed: string[] = [];
    for (const perm of currPerms) {
      if (!newPerms.has(perm)) {
        removed.push(perm);
      }
    }

    for (const perm of added) {
      const problem = permissionGrantProblem(roleRef, perm);
      if (problem !== null) {
        guardrailFields[`${change.scope}.${change.key}:${perm}`] =
          PERMISSION_GRANT_PROBLEM_MESSAGES[problem];
      } else {
        grants.push({
          scope: change.scope,
          key: change.key,
          permission: perm,
        });
      }
    }

    for (const perm of removed) {
      const problem = permissionRevokeProblem(roleRef);
      if (problem !== null) {
        guardrailFields[`${change.scope}.${change.key}:${perm}`] =
          PERMISSION_GRANT_PROBLEM_MESSAGES[problem];
      } else {
        revokes.push({
          scope: change.scope,
          key: change.key,
          permission: perm,
        });
      }
    }

    if (added.length > 0 || removed.length > 0) {
      changedRoles.push(roleRef);
    }
  }

  if (Object.keys(guardrailFields).length > 0) {
    return { status: 'invalid', fields: guardrailFields };
  }

  // 5. Success
  return {
    status: 'ok',
    grants,
    revokes,
    changedRoles,
  };
}

