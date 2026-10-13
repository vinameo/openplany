import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_ADDED_WORKSPACE_ROLE,
  isWorkspaceAdminRole,
  WORKSPACE_ROLE_RANK,
  type MemberCandidate,
  type WorkspaceRole,
} from "@repo/contracts";
import {
  AddMembersModalFrame,
  type SubmitOutcome,
} from "../../../members/AddMembersModalFrame";
import type { AddMemberRow } from "../../../members/addMembersRows";
import { WORKSPACE_ROLE_SCHEME } from "../../../members/roleScheme";
import { submitAddMembers } from "../../../members/submitAddMembers";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { membersApi } from "./api/membersApi";
import {
  addWorkspaceMembersToCache,
  clearWorkspaceMemberCandidates,
} from "./api/workspaceMemberQueries";
import { MemberCandidateSelect } from "./MemberCandidateSelect";

interface AddMembersModalProps {
  opened: boolean;
  onClose: () => void;
  slug: string;
  addableRoles: WorkspaceRole[];
  onSuccess: () => void;
}

export function AddMembersModal({
  opened,
  onClose,
  slug,
  addableRoles,
  onSuccess,
}: AddMembersModalProps) {
  const queryClient = useQueryClient();
  const { reload: reloadWorkspace } = useCurrentWorkspace();

  const sortedAddableRoles = useMemo(() => {
    return [...addableRoles].sort(
      (a, b) => WORKSPACE_ROLE_RANK[a] - WORKSPACE_ROLE_RANK[b],
    );
  }, [addableRoles]);

  const defaultRole: WorkspaceRole = useMemo(() => {
    if (addableRoles.includes(DEFAULT_ADDED_WORKSPACE_ROLE)) {
      return DEFAULT_ADDED_WORKSPACE_ROLE;
    }
    return sortedAddableRoles[0] ?? DEFAULT_ADDED_WORKSPACE_ROLE;
  }, [addableRoles, sortedAddableRoles]);

  const highestAddableRole = sortedAddableRoles[sortedAddableRoles.length - 1];

  const handleSubmit = (
    body: { members: { userId: string; role: WorkspaceRole }[] },
    rowIdByIndex: readonly string[],
  ): Promise<SubmitOutcome> =>
    submitAddMembers({
      send: () => membersApi.add(slug, body),
      rowIdByIndex,
      afterAdded: async (res) => {
        addWorkspaceMembersToCache(queryClient, slug, res.members);
        clearWorkspaceMemberCandidates(queryClient, slug);
        onSuccess();
        await reloadWorkspace();
      },
      refreshAfterLostAccess: reloadWorkspace,
      logContext: "workspace.members.add",
    });

  return (
    <AddMembersModalFrame<WorkspaceRole, MemberCandidate>
      opened={opened}
      onClose={onClose}
      title="Add member"
      description="Add members to collaborate in your workspace."
      scheme={WORKSPACE_ROLE_SCHEME}
      defaultRole={defaultRole}
      roleOptionsFor={() => sortedAddableRoles}
      renderCandidate={(row, otherSelectedIds, onSelect) => (
        <MemberCandidateSelect
          slug={slug}
          value={row.candidate}
          onChange={onSelect}
          selectedUserIds={otherSelectedIds}
          error={row.error}
          errorId={row.error ? `candidate-error-${row.id}` : undefined}
        />
      )}
      notice={(row: AddMemberRow<WorkspaceRole, MemberCandidate>) =>
        row.role === highestAddableRole && isWorkspaceAdminRole(row.role)
          ? "Admins can manage everyone in this workspace, including you."
          : null
      }
      onSubmit={handleSubmit}
    />
  );
}
