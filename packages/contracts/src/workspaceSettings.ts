import {
  NO_HIDDEN_CHARS,
  NO_URL,
  WORKSPACE_NAME_MAX,
  type WorkspaceResponse,
} from './workspace.js';

export const EDITABLE_WORKSPACE_FIELDS = [
  'name',
  'organizationSize',
  'timezone',
] as const;
export type EditableWorkspaceField = (typeof EDITABLE_WORKSPACE_FIELDS)[number];
export type UpdateWorkspaceRequest = Partial<
  Pick<WorkspaceResponse, EditableWorkspaceField>
>;

/** NFC + trim: the same cleanup on web and API (RQ 5.2). */
export function normalizeWorkspaceName(name: string): string {
  return name.normalize('NFC').trim();
}

/** Field-level messages shared by DTOs (create + update) and web forms. */
export const WORKSPACE_NAME_MESSAGES = {
  required: 'Enter a workspace name',
  tooLong: `Workspace name must be ${WORKSPACE_NAME_MAX} characters or fewer`,
  hiddenChars: "Contains characters that aren't allowed",
  url: 'Workspace name cannot contain a URL',
} as const;

/** The first problem with a (normalized) name, or null. Web uses it; API uses the decorators + same messages. */
export function workspaceNameProblem(name: string): string | null {
  const normalized = normalizeWorkspaceName(name);
  if (normalized.length === 0) {
    return WORKSPACE_NAME_MESSAGES.required;
  }
  if (normalized.length > WORKSPACE_NAME_MAX) {
    return WORKSPACE_NAME_MESSAGES.tooLong;
  }
  if (!NO_HIDDEN_CHARS.test(normalized)) {
    return WORKSPACE_NAME_MESSAGES.hiddenChars;
  }
  if (!NO_URL.test(normalized)) {
    return WORKSPACE_NAME_MESSAGES.url;
  }
  return null;
}

/** Keys of `next` whose value differs (===) from `current`. Ignores keys outside `keys`. */
export function pickChangedFields<T extends object, K extends keyof T>(
  current: T,
  next: Partial<Pick<T, K>>,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const changes: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      const nextVal = next[key];
      if (nextVal !== undefined && nextVal !== current[key]) {
        changes[key] = nextVal;
      }
    }
  }
  return changes;
}

