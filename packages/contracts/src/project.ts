import { NO_HIDDEN_CHARS, removeDiacritics } from "./workspace.js";
import type { ProjectRole } from "./projectRoles.js";
import type { EnforcedProjectPermission } from "./projectPermissions.js";

export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 2000;
export const PROJECT_IDENTIFIER_MAX = 5;
export const PROJECT_IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9]{0,4}$/;
export const PROJECT_LIST_MAX = 1000;
export const PROJECT_MEMBER_AVATAR_LIMIT = 5;
/**
 * Most members returned per project in the list. The table shows
 * PROJECT_MEMBER_AVATAR_LIMIT avatars plus the overflow names; `memberCount`
 * carries the real total so the payload stays bounded for large projects.
 */
export const PROJECT_MEMBER_PREVIEW_MAX = 20;

/**
 * Description is multi-line: tab, line feed and carriage return are allowed;
 * every other control character (including NUL, which PostgreSQL text
 * columns reject) is not.
 */
export const PROJECT_DESCRIPTION_ALLOWED_CHARS = /^(?:[\t\n\r]|[^\p{Cc}])*$/u;

/** 65 icons. Tabler kebab-case names. */
export const PROJECT_ICON_NAMES = [
  "square-check",
  "circle-check",
  "home",
  "star",
  "heart",
  "bolt",
  "flag",
  "target",
  "trophy",
  "rocket",
  "briefcase",
  "building",
  "folder",
  "file-text",
  "book",
  "notebook",
  "clipboard-list",
  "list-check",
  "calendar",
  "clock",
  "chart-bar",
  "chart-pie",
  "presentation",
  "bulb",
  "puzzle",
  "palette",
  "brush",
  "pencil",
  "camera",
  "photo",
  "music",
  "video",
  "message",
  "mail",
  "users",
  "user",
  "world",
  "map",
  "compass",
  "plane",
  "truck",
  "shopping-cart",
  "credit-card",
  "coin",
  "gift",
  "leaf",
  "sun",
  "moon",
  "cloud",
  "database",
  "server",
  "cpu",
  "code",
  "terminal",
  "git-branch",
  "bug",
  "api",
  "device-desktop",
  "device-mobile",
  "shield",
  "lock",
  "key",
  "tool",
  "settings",
  "search",
] as const;
export type ProjectIconName = (typeof PROJECT_ICON_NAMES)[number];
export const DEFAULT_PROJECT_ICON: ProjectIconName = "square-check";

/** 8 preset colors from draft -2.png (gray, slate, indigo, cyan, green, yellow, orange, pink). Uppercase. */
export const PROJECT_ICON_PRESET_COLORS = [
  "#868E96",
  "#5C6B7A",
  "#5C5FD6",
  "#15AABF",
  "#2F9E44",
  "#FAB005",
  "#F76707",
  "#FF8787",
] as const;
export const DEFAULT_PROJECT_ICON_COLOR = PROJECT_ICON_PRESET_COLORS[0];
export const PROJECT_ICON_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const PROJECT_COVER_KEYS = [
  "cover-01",
  "cover-02",
  "cover-03",
  "cover-04",
  "cover-05",
  "cover-06",
  "cover-07",
  "cover-08",
] as const;
export type ProjectCoverKey = (typeof PROJECT_COVER_KEYS)[number];
export const DEFAULT_PROJECT_COVER: ProjectCoverKey = "cover-01";

const PROJECT_ICON_SET = new Set<string>(PROJECT_ICON_NAMES);
const PROJECT_COVER_SET = new Set<string>(PROJECT_COVER_KEYS);

export function isProjectIconName(value: string): value is ProjectIconName {
  return PROJECT_ICON_SET.has(value);
}

export function isProjectCoverKey(value: string): value is ProjectCoverKey {
  return PROJECT_COVER_SET.has(value);
}

/**
 * RQ D15. Suggest uppercase project identifier from name:
 * 1. removeDiacritics(name).toUpperCase()
 * 2. Split by /[^A-Z0-9]+/, filter empty words.
 * 3. 1 word -> first 3 chars; multiple words -> first char of up to 5 words.
 * 4. Remove leading digits; slice to 5 chars.
 * 5. Return '' if not matching PROJECT_IDENTIFIER_PATTERN.
 */
export function suggestProjectIdentifier(name: string): string {
  const clean = removeDiacritics(name).toUpperCase();
  const words = clean.split(/[^A-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  let id = "";
  if (words.length === 1) {
    id = words[0]!.slice(0, 3);
  } else {
    id = words
      .slice(0, 5)
      .map((w) => w[0])
      .join("");
  }
  id = id.replace(/^[0-9]+/, "").slice(0, PROJECT_IDENTIFIER_MAX);
  return PROJECT_IDENTIFIER_PATTERN.test(id) ? id : "";
}

/** NFC normalization and trim (API-F7). */
export function normalizeProjectName(name: string): string {
  return name.normalize("NFC").trim();
}

export interface ProjectIcon {
  name: ProjectIconName;
  color: string;
}

export interface CreateProjectRequest {
  name: string;
  identifier: string;
  description?: string;
  icon: ProjectIcon;
  coverKey: ProjectCoverKey;
}

export interface ProjectMemberSummary {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  /** Only present if viewer has workspace.members.email.view */
  email?: string;
  accountActive: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  identifier: string;
  description: string;
  icon: { name: string; color: string };
  coverKey: string;
  createdAt: string;
  /** Oldest first, at most PROJECT_MEMBER_PREVIEW_MAX. null when the viewer lacks project.members.view. */
  members: ProjectMemberSummary[] | null;
  /** Real number of members; null exactly when `members` is null. */
  memberCount: number | null;
  role: ProjectRole;
  permissions: EnforcedProjectPermission[];
}

export interface ProjectListResponse {
  projects: ProjectListItem[];
  /** Every project the viewer can access, even when `projects` is cut at PROJECT_LIST_MAX. */
  total: number;
  truncated: boolean;
}

export interface CreateProjectResponse {
  project: ProjectListItem;
}

/** GET /workspaces/:slug/projects/:identifier (RQ D16). */
export interface ProjectResponse {
  project: ProjectListItem;
}

export const PROJECT_FIELD_MESSAGES = {
  nameRequired: "Enter a project name",
  nameTooLong: `Enter a project name (up to ${PROJECT_NAME_MAX} characters)`,
  /** Tên và mô tả; thay PROJECT_ERROR_MESSAGES.descriptionChars. */
  hiddenChars: "Contains characters that aren't allowed",
  descriptionTooLong: `Keep the description under ${PROJECT_DESCRIPTION_MAX} characters`,
  iconRequired: "Choose an icon",
  iconColorInvalid: "Use a color like #1A2B3C",
  coverRequired: "Choose a cover",
} as const;

/** Lỗi đầu tiên của tên (sau normalizeProjectName), hoặc null. Web dùng; API dùng decorator + cùng câu. */
export function projectNameProblem(name: string): string | null {
  const normalized = normalizeProjectName(name);
  if (!normalized) {
    return PROJECT_FIELD_MESSAGES.nameRequired;
  }
  if (normalized.length > PROJECT_NAME_MAX) {
    return PROJECT_FIELD_MESSAGES.nameTooLong;
  }
  if (!NO_HIDDEN_CHARS.test(normalized)) {
    return PROJECT_FIELD_MESSAGES.hiddenChars;
  }
  return null;
}

/** Lỗi đầu tiên của mô tả, hoặc null. */
export function projectDescriptionProblem(description: string): string | null {
  if (!description) {
    return null;
  }
  if (description.length > PROJECT_DESCRIPTION_MAX) {
    return PROJECT_FIELD_MESSAGES.descriptionTooLong;
  }
  if (!PROJECT_DESCRIPTION_ALLOWED_CHARS.test(description)) {
    return PROJECT_FIELD_MESSAGES.hiddenChars;
  }
  return null;
}

export const PROJECT_ERROR_MESSAGES = {
  nameTaken: "A project with this name already exists",
  identifierTaken: "This project ID is already used",
  notFound: "This project doesn't exist.",
  forbidden: "You don't have access to this project.",
} as const;
