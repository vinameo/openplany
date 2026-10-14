import { ADD_MEMBERS_MAX } from "./workspaceMembers.js";

export const MEMBER_MESSAGES = {
  rowDuplicate: "This person is already in another row",
  candidateQueryTooShort: "Type at least 3 characters",
  candidateQueryInvalid: "Remove special characters from the email",
  choosePerson: "Choose a person",
  chooseRole: "Choose a role",
  addAtLeastOne: "Add at least one person",
  addAtMost: `Add up to ${ADD_MEMBERS_MAX} people at a time`,
  checkFields: "Check the highlighted fields",
  notAllowed: "You don't have permission to do this",
  roleNotAllowed: "You can't assign this role",
  roleChanged:
    "Their role was just changed by someone else. Review it and try again.",
  sameRole: "Choose a different role",
  roleOutOfRange: "This role isn't allowed for their workspace role.",
  someNotAdded: "Some people couldn't be added",
  tooManySearches: "Too many searches. Try again later.",
} as const;

export function truncatedMembersMessage(shown: number, total: number): string {
  return `Showing the first ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} members.`;
}

export function truncatedProjectMembersMessage(
  shown: number,
  total: number,
): string {
  return `Showing the first ${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} project members.`;
}

/** Không ký tự điều khiển (kể cả NUL). Dùng ở DTO tìm ứng viên chung (SR-4). */
export const MEMBER_CANDIDATE_QUERY_ALLOWED = /^[^\p{Cc}]*$/u;

/** Kiểm sơ bộ "đã gõ đủ một email" — chỉ để web nhắc ở chế độ khớp đúng; server không dùng (SR-11). */
export function looksLikeFullEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+$/u.test(trimmed);
}
