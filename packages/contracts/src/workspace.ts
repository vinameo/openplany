import type { EnforcedWorkspacePermission } from './workspacePermissions.js';

export const WORKSPACE_NAME_MAX = 80;
export const WORKSPACE_SLUG_MIN = 3;
export const WORKSPACE_SLUG_MAX = 48;
export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const NO_HIDDEN_CHARS = /^[^\p{Cc}\p{Cf}]*$/u;
export const NO_URL = /^(?!.*:\/\/)(?!www\.)/iu;

export const ORGANIZATION_SIZES = [
  'Just myself',
  '2-10',
  '11-50',
  '51-200',
  '201-500',
  '500+',
] as const;
export type OrganizationSize = (typeof ORGANIZATION_SIZES)[number];

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'guest'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_ROLE_RANK = {
  owner: 40,
  admin: 30,
  member: 20,
  guest: 10,
} as const satisfies Record<WorkspaceRole, number>;

export const WORKSPACE_ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
} as const satisfies Record<WorkspaceRole, string>;

export const WORKSPACE_ROLE_SUMMARIES = {
  owner: 'Everything, including transferring ownership and deleting the workspace',
  admin: 'Manage settings, members and projects; access to every project',
  member: 'Work in the projects they join; join public projects',
  guest: 'View-only access',
} as const satisfies Record<WorkspaceRole, string>;

export const WORKSPACE_COLORS = [
  '#0F172A',
  '#374151',
  '#1D4ED8',
  '#047857',
  '#7C3AED',
  '#C2410C',
  '#0E7490',
  '#BE185D',
] as const;

export const RESERVED_WORKSPACE_SLUG_LIST = [
  // Web routes
  'sign-in',
  'sign-out',
  'sign-up',
  'set-password',
  'forgot-password',
  'reset-password',
  'create-workspace',
  'create-user',
  'roles-and-permissions',
  'onboarding',
  'invitations',
  'invite',
  'profile',
  'settings',
  'accounts',
  // Infrastructure & static resources
  'slug-check',
  'api',
  'assets',
  'static',
  'public',
  'cdn',
  'graphql',
  'webhook',
  'webhooks',
  'oauth',
  'auth',
  'health',
  'status',
  'ping',
  'robots',
  'sitemap',
  'favicon',
  // Brand & system terms
  'admin',
  'administrator',
  'app',
  'billing',
  'bot',
  'config',
  'console',
  'dashboard',
  'dev',
  'docs',
  'error',
  'help',
  'home',
  'jobs',
  'legal',
  'login',
  'logout',
  'new',
  'notifications',
  'org',
  'pricing',
  'privacy',
  'root',
  'security',
  'support',
  'sys',
  'system',
  'terms',
  'user',
  'users',
  'workspace',
  'workspaces',
  'openplany',
  'instance',
] as const;

export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set(
  RESERVED_WORKSPACE_SLUG_LIST,
);

/**
 * Generates a clean URL slug from a workspace name.
 * 1. NFKD decomposition, replace đ/Đ -> d, strip marks.
 * 2. lowercase.
 * 3. [^a-z0-9]+ -> single '-'.
 * 4. trim leading/trailing '-'.
 * 5. truncate to 48 chars and trim any trailing '-'.
 */
export function slugify(name: string): string {
  const decomposed = name
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  const lower = decomposed.toLowerCase();
  const hyphens = lower.replace(/[^a-z0-9]+/g, '-');
  const trimmed = hyphens.replace(/^-+|-+$/g, '');
  return trimmed.slice(0, WORKSPACE_SLUG_MAX).replace(/-+$/g, '');
}

/**
 * Normalizes live user input into valid slug character space without removing trailing '-'
 * so users can continue typing hyphenated slugs like "acme-team".
 */
export function normalizeSlugInput(value: string): string {
  const decomposed = value
    .replace(/[đĐ]/g, 'd')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
  const lower = decomposed.toLowerCase();
  const hyphens = lower.replace(/[\s_]+/g, '-');
  return hyphens.replace(/[^a-z0-9-]/g, '');
}

/**
 * Extracts the last path segment from a pasted URL or text, then normalizes.
 */
export function extractSlugFromUrl(text: string): string {
  const trimmed = text.trim();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] ?? '';
    return normalizeSlugInput(lastPart);
  }
  return normalizeSlugInput(trimmed);
}

/**
 * Deterministically chooses one of the 8 accessible workspace colors based on FNV-1a hash of ID.
 */
export function pickWorkspaceColor(
  workspaceId: string,
): (typeof WORKSPACE_COLORS)[number] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < workspaceId.length; i++) {
    hash ^= workspaceId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = Math.abs(hash) % WORKSPACE_COLORS.length;
  return WORKSPACE_COLORS[index]!;
}

/**
 * Fast synchronous check for client-side problem or reserved status.
 */
export function workspaceSlugProblem(
  slug: string,
): 'INVALID' | 'RESERVED' | null {
  if (
    slug.length < WORKSPACE_SLUG_MIN ||
    slug.length > WORKSPACE_SLUG_MAX ||
    !WORKSPACE_SLUG_PATTERN.test(slug)
  ) {
    return 'INVALID';
  }
  if (RESERVED_WORKSPACE_SLUGS.has(slug)) {
    return 'RESERVED';
  }
  return null;
}

export interface CreateWorkspaceRequest {
  name: string;
  slug: string;
  organizationSize: OrganizationSize;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  backgroundColor: string;
  organizationSize: OrganizationSize;
  timezone: string;
  role: WorkspaceRole;
  permissions: EnforcedWorkspacePermission[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceResponse[];
  lastWorkspaceSlug: string | null;
}

export type SlugUnavailableReason = 'INVALID' | 'RESERVED' | 'TAKEN';

export interface SlugCheckResponse {
  slug: string;
  available: boolean;
  reason: SlugUnavailableReason | null;
}

