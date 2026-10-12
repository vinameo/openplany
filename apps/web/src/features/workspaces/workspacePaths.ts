/** The workspace Home, which lists its projects. Every workspace URL starts here. */
export function workspacePath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

/** Workspace settings, or one of its sections. */
export function workspaceSettingsPath(slug: string, section?: string): string {
  const settings = `${workspacePath(slug)}/settings`;
  return section === undefined
    ? settings
    : `${settings}/${encodeURIComponent(section)}`;
}
