import {
  type PermissionItem,
  type RoleRef,
  type RoleResponse,
  type RoleScope,
  type UpdateRolePermissionsRequest,
  isRoleLocked,
  PERMISSION_GRANT_PROBLEM_MESSAGES,
  permissionGrantProblem,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLES,
} from "@repo/contracts";
import { permissionGroupOf } from "./permissionLabels";

export type RoleId = `${RoleScope}.${string}`;

/** Bản nháp: bộ quyền MỚI của các vai trò đã chạm; vai trò không chạm thì không có khoá. */
export type PermissionDraft = Readonly<Record<RoleId, readonly string[]>>;

export interface MatrixCell {
  role: RoleRef;
  checked: boolean;
  changed: boolean;
  disabledReason: string | null;
}

export interface MatrixRow {
  permission: string;
  label: string;
  enforced: boolean;
  cells: MatrixCell[];
}

export interface MatrixGroup {
  label: string;
  rows: MatrixRow[];
}

export interface PermissionMatrixModel {
  scope: RoleScope;
  roles: { ref: RoleRef; label: string; locked: boolean }[];
  groups: MatrixGroup[];
}

export function buildPermissionMatrix(
  scope: RoleScope,
  roles: readonly RoleResponse[],
  draftOrPermissions?: PermissionDraft | readonly PermissionItem[],
  permissionsOrDraft?: readonly PermissionItem[] | PermissionDraft,
): PermissionMatrixModel {
  let draft: PermissionDraft = {};
  let permissions: readonly PermissionItem[] = [];

  if (Array.isArray(draftOrPermissions)) {
    permissions = draftOrPermissions;
    if (permissionsOrDraft && !Array.isArray(permissionsOrDraft)) {
      draft = permissionsOrDraft as PermissionDraft;
    }
  } else {
    if (draftOrPermissions) {
      draft = draftOrPermissions as PermissionDraft;
    }
    if (Array.isArray(permissionsOrDraft)) {
      permissions = permissionsOrDraft;
    }
  }

  const labelMap = new Map<string, string>();
  for (const p of permissions) {
    labelMap.set(p.key, p.label);
  }

  // 1. Roles order
  let orderedRoles: { ref: RoleRef; label: string; locked: boolean }[];
  if (scope === "workspace") {
    orderedRoles = WORKSPACE_ROLES.map((key) => {
      const serverRole = roles.find(
        (r) => r.scope === "workspace" && r.key === key,
      );
      const locked =
        serverRole?.locked ?? isRoleLocked({ scope: "workspace", key });
      return {
        ref: { scope: "workspace", key } as RoleRef,
        label: WORKSPACE_ROLE_LABELS[key],
        locked,
      };
    });
  } else {
    orderedRoles = PROJECT_ROLES.map((key) => {
      const serverRole = roles.find(
        (r) => r.scope === "project" && r.key === key,
      );
      const locked =
        serverRole?.locked ?? isRoleLocked({ scope: "project", key });
      return {
        ref: { scope: "project", key } as RoleRef,
        label: PROJECT_ROLE_LABELS[key],
        locked,
      };
    });
  }

  // 2. Catalogue permissions & enforced lookup
  let catalog: readonly string[];
  if (permissions.length > 0) {
    catalog = permissions.filter((p) => p.scope === scope).map((p) => p.key);
  } else {
    // Fallback when permissions not provided: collect unique permissions from roles matching scope
    const set = new Set<string>();
    for (const role of roles) {
      if (role.scope === scope) {
        for (const p of role.permissions) {
          set.add(p);
        }
      }
    }
    catalog = Array.from(set);
  }

  // 3. Build rows grouped by permissionGroupOf
  const groupMap = new Map<string, MatrixRow[]>();

  for (const perm of catalog) {
    const label = labelMap.get(perm) ?? perm;
    const enforced = perm === "workspace.settings.update";

    const cells: MatrixCell[] = orderedRoles.map((role) => {
      const roleId: RoleId = `${role.ref.scope}.${role.ref.key}`;
      const serverRole = roles.find(
        (r) => r.scope === role.ref.scope && r.key === role.ref.key,
      );
      const serverPerms = (serverRole ? serverRole.permissions : []) as readonly string[];
      const effectivePerms =
        draft[roleId] !== undefined ? draft[roleId] : serverPerms;

      const serverChecked = serverPerms.includes(perm);
      const checked = effectivePerms.includes(perm);
      const changed = checked !== serverChecked;

      let disabledReason: string | null = null;
      if (role.locked) {
        disabledReason = PERMISSION_GRANT_PROBLEM_MESSAGES.ROLE_LOCKED;
      } else if (!checked) {
        const problem = permissionGrantProblem(role.ref, perm);
        if (problem !== null) {
          disabledReason = PERMISSION_GRANT_PROBLEM_MESSAGES[problem];
        }
      }

      return {
        role: role.ref,
        checked,
        changed,
        disabledReason,
      };
    });

    const row: MatrixRow = {
      permission: perm,
      label,
      enforced,
      cells,
    };

    const groupLabel = permissionGroupOf(perm);
    const existing = groupMap.get(groupLabel) ?? [];
    existing.push(row);
    groupMap.set(groupLabel, existing);
  }

  const groups: MatrixGroup[] = Array.from(groupMap.entries()).map(
    ([groupLabel, rows]) => ({
      label: groupLabel,
      rows,
    }),
  );

  return {
    scope,
    roles: orderedRoles,
    groups,
  };
}

export function togglePermission(
  draft: PermissionDraft,
  roles: readonly RoleResponse[],
  role: RoleRef,
  permission: string,
  catalogPermissions?: readonly string[] | readonly PermissionItem[],
): PermissionDraft {
  const roleId: RoleId = `${role.scope}.${role.key}`;
  const serverRole = roles.find(
    (r) => r.scope === role.scope && r.key === role.key,
  );
  const serverPerms = (serverRole ? serverRole.permissions : []) as readonly string[];
  const currentPerms = draft[roleId] !== undefined ? draft[roleId] : serverPerms;

  const isChecked = currentPerms.includes(permission);
  const nextPerms = isChecked
    ? currentPerms.filter((p) => p !== permission)
    : [...currentPerms, permission];

  let catalog: readonly string[];
  if (catalogPermissions && catalogPermissions.length > 0) {
    catalog =
      typeof catalogPermissions[0] === "string"
        ? (catalogPermissions as readonly string[])
        : (catalogPermissions as readonly PermissionItem[])
            .filter((p) => p.scope === role.scope)
            .map((p) => p.key);
  } else {
    const serverRole = roles.find(
      (r) => r.scope === role.scope && r.key === role.key,
    );
    catalog = (serverRole ? serverRole.permissions : []) as readonly string[];
  }

  const nextSet = new Set(nextPerms);
  const orderedNextPerms = catalog.filter((p) => nextSet.has(p));
  for (const p of nextPerms) {
    if (!orderedNextPerms.includes(p)) {
      orderedNextPerms.push(p);
    }
  }

  const serverSet = new Set(serverPerms);
  const isSameAsServer =
    orderedNextPerms.length === serverPerms.length &&
    orderedNextPerms.every((p) => serverSet.has(p));

  const nextDraft: Record<RoleId, readonly string[]> = { ...draft };
  if (isSameAsServer) {
    delete nextDraft[roleId];
  } else {
    nextDraft[roleId] = orderedNextPerms;
  }

  return nextDraft;
}

export function diffDraft(
  roles: readonly RoleResponse[],
  draft: PermissionDraft,
): { role: RoleRef; granted: string[]; revoked: string[] }[] {
  const result: { role: RoleRef; granted: string[]; revoked: string[] }[] = [];

  // Order checking: workspace roles first, then project roles
  const allRoleRefs: RoleRef[] = [
    ...WORKSPACE_ROLES.map((key) => ({ scope: "workspace" as const, key })),
    ...PROJECT_ROLES.map((key) => ({ scope: "project" as const, key })),
  ];

  for (const ref of allRoleRefs) {
    const roleId: RoleId = `${ref.scope}.${ref.key}`;
    if (draft[roleId] === undefined) continue;

    const serverRole = roles.find(
      (r) => r.scope === ref.scope && r.key === ref.key,
    );
    const serverPerms = (serverRole ? serverRole.permissions : []) as readonly string[];
    const draftPerms = draft[roleId];

    const serverSet = new Set(serverPerms);
    const draftSet = new Set(draftPerms);

    const granted = draftPerms.filter((p) => !serverSet.has(p));
    const revoked = serverPerms.filter((p) => !draftSet.has(p));

    if (granted.length > 0 || revoked.length > 0) {
      result.push({
        role: ref,
        granted,
        revoked,
      });
    }
  }

  return result;
}

export function toUpdateRequest(
  roles: readonly RoleResponse[],
  draft: PermissionDraft,
): UpdateRolePermissionsRequest {
  const diff = diffDraft(roles, draft);
  const changes = diff.map((d) => {
    const serverRole = roles.find(
      (r) => r.scope === d.role.scope && r.key === d.role.key,
    );
    const roleId: RoleId = `${d.role.scope}.${d.role.key}`;
    const permissions = [...(draft[roleId] ?? serverRole?.permissions ?? [])];
    return {
      scope: d.role.scope,
      key: d.role.key,
      version: serverRole?.version ?? 1,
      permissions,
    };
  });

  return { changes };
}
