import { type WorkspaceRole, removeDiacritics } from './workspace.js';

export const WORKSPACE_MEMBER_LIST_MAX = 1000;

export const MEMBER_CANDIDATE_QUERY_MIN = 3;
export const MEMBER_CANDIDATE_LIMIT = 10;

/** So khớp không phân biệt hoa thường và dấu, dùng cho ô Search trên trang (A6, API-08). */
export function normalizeForSearch(value: string): string {
  return removeDiacritics(value).toLowerCase().trim();
}

/** Thoát ký tự đặc biệt của LIKE (% _ \) (API-09). */
export function escapeLikePattern(str: string): string {
  return str.replace(/[\\%_]/g, '\\$&');
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

export interface MemberCandidate {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  alreadyMember: boolean;
}

export interface MemberCandidateListResponse {
  candidates: MemberCandidate[];
}

export const ADD_MEMBERS_MAX = 20;

export interface AddWorkspaceMembersRequest {
  members: { userId: string; role: WorkspaceRole }[];
}

export interface AddWorkspaceMembersResponse {
  members: WorkspaceMemberResponse[];
}

/** Lý do một dòng không thêm được (409). Web dùng để chọn câu chữ; server gửi câu chữ trong fields. */
export const MEMBER_NOT_ADDABLE_REASONS = ['already_member', 'unavailable'] as const;
export type MemberNotAddableReason = (typeof MEMBER_NOT_ADDABLE_REASONS)[number];
export const MEMBER_NOT_ADDABLE_MESSAGES = {
  already_member: 'Already a member of this workspace',
  unavailable: "This person can't be added. Their account may be deactivated.",
} as const satisfies Record<MemberNotAddableReason, string>;
