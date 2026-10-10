import { type WorkspaceRole, removeDiacritics } from './workspace.js';

export const WORKSPACE_MEMBER_LIST_MAX = 1000;

/** So khớp không phân biệt hoa thường và dấu, dùng cho ô Search trên trang (A6, API-08). */
export function normalizeForSearch(value: string): string {
  return removeDiacritics(value).toLowerCase().trim();
}

export interface WorkspaceMemberResponse {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  /** Chỉ có khi người xem có workspace.members.email.view. Không có thì KHÔNG có khoá (RQ INV-07). */
  email?: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string; // ISO 8601
  accountActive: boolean;
}

export interface WorkspaceMemberListResponse {
  members: WorkspaceMemberResponse[];
  total: number;
  truncated: boolean;
  addableRoles: WorkspaceRole[];
}

