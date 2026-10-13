import type { QueryClient } from "@tanstack/react-query";
import type {
  WorkspaceMemberListResponse,
  WorkspaceMemberResponse,
} from "@repo/contracts";

export const workspaceMemberKeys = {
  all: ["workspaces"] as const,
  workspace: (slug: string) => ["workspaces", slug] as const,
  list: (slug: string) => ["workspaces", slug, "members"] as const,
  candidates: (slug: string, query?: string) =>
    query !== undefined
      ? (["workspaces", slug, "member-candidates", query] as const)
      : (["workspaces", slug, "member-candidates"] as const),
  roleChangePreview: (slug: string, userId: string, role: string) =>
    [
      "workspaces",
      slug,
      "members",
      userId,
      "role-change-preview",
      role,
    ] as const,
};

export function clearWorkspaceMemberCandidates(
  qc: QueryClient,
  slug: string,
): void {
  qc.removeQueries({ queryKey: ["workspaces", slug, "member-candidates"] });
}

export function replaceWorkspaceMemberInCache(
  qc: QueryClient,
  slug: string,
  updatedMember: WorkspaceMemberResponse,
): void {
  qc.setQueryData<WorkspaceMemberListResponse>(
    workspaceMemberKeys.list(slug),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        members: old.members.map((m) =>
          m.userId === updatedMember.userId ? { ...m, ...updatedMember } : m,
        ),
      };
    },
  );
}

export function addWorkspaceMembersToCache(
  qc: QueryClient,
  slug: string,
  added: readonly WorkspaceMemberResponse[],
): void {
  if (added.length === 0) return;
  qc.setQueryData<WorkspaceMemberListResponse>(
    workspaceMemberKeys.list(slug),
    (old) => {
      if (!old) return old;
      const existingUserIds = new Set(old.members.map((m) => m.userId));
      const newMembers = added.filter((m) => !existingUserIds.has(m.userId));
      return {
        ...old,
        total: old.total + added.length,
        members: [...old.members, ...newMembers],
      };
    },
  );
}
