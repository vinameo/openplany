export const SIDEBAR_COLLAPSED_STORAGE_KEY =
  "openplany.workspaceSidebar.collapsed";

/** Only the exact string "true" means collapsed; anything else (missing, corrupt) means open. */
export function parseSidebarCollapsed(raw: string | null | undefined): boolean {
  return raw === "true";
}

export function serializeSidebarCollapsed(collapsed: boolean): string {
  return collapsed ? "true" : "false";
}
