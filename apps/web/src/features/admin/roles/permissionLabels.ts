import type { MessageKey } from "@repo/contracts";
import { translate } from "../../../i18n/index.js";

export const PERMISSION_GROUP_KEYS = {
  // Workspace groups
  "workspace.settings": "permissionGroups:workspace.settings",
  "workspace.members": "permissionGroups:workspace.members",
  "workspace.projects": "permissionGroups:workspace.projects",
  "workspace.states": "permissionGroups:workspace.states",
  "workspace.delete": "permissionGroups:workspace.delete",

  // Project groups
  "project.settings": "permissionGroups:project.settings",
  "project.archive": "permissionGroups:project.settings",
  "project.members": "permissionGroups:project.members",
  "project.workitems": "permissionGroups:project.workitems",
  "project.comments": "permissionGroups:project.comments",
  "project.reactions": "permissionGroups:project.comments",
  "project.cycles": "permissionGroups:project.cycles",
  "project.modules": "permissionGroups:project.modules",
  "project.views": "permissionGroups:project.views",
  "project.pages": "permissionGroups:project.pages",
  "project.labels": "permissionGroups:project.labels",
  "project.states": "permissionGroups:project.labels",
  "project.estimates": "permissionGroups:project.labels",
  "project.analytics": "permissionGroups:project.analytics",
} as const satisfies Record<string, MessageKey>;

/** PERMISSION_GROUP_LABELS stores message keys (INV-15) */
export const PERMISSION_GROUP_LABELS = PERMISSION_GROUP_KEYS;

export function permissionGroupKeyOf(permission: string): MessageKey {
  const parts = permission.split(".");
  const key = `${parts[0]}.${parts[1]}` as keyof typeof PERMISSION_GROUP_KEYS;
  return (
    PERMISSION_GROUP_KEYS[key] ?? ("permissionGroups:general" as MessageKey)
  );
}

export function permissionGroupOf(permission: string): string {
  return translate(permissionGroupKeyOf(permission));
}
