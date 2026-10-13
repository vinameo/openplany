import { useMemo } from "react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_ADDED_WORKSPACE_ROLE,
  isWorkspaceAdminRole,
  WORKSPACE_ROLE_RANK,
  type MemberCandidate,
  type WorkspaceRole,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import {
  AddMembersModalFrame,
  type SubmitOutcome,
} from "../../../members/AddMembersModalFrame";
import {
  mapFieldErrors,
  type AddMemberRow,
} from "../../../members/addMembersRows";
import { WORKSPACE_ROLE_SCHEME } from "../../../members/roleScheme";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import {
  clearWorkspaceMemberCandidates,
  membersApi,
} from "./api/membersApi";
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

  const handleSubmit = async (
    body: { members: { userId: string; role: WorkspaceRole }[] },
    rowIdByIndex: readonly string[],
  ): Promise<SubmitOutcome> => {
    try {
      const res = await membersApi.add(slug, body);
      const count = res.members.length;
      notifications.show({
        message: `Added ${count} member${count === 1 ? "" : "s"}`,
      });
      clearWorkspaceMemberCandidates(queryClient, slug);
      await reloadWorkspace();
      onSuccess();
      return { kind: "done" };
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          notifications.show({
            color: "red",
            message: err.message || "You don't have permission to do this",
          });
          await reloadWorkspace();
          return { kind: "done" };
        }

        if (err.status === 429) {
          const seconds = err.retryAfterSeconds;
          return {
            kind: "alert",
            message: seconds
              ? `Too many attempts. Try again in ${seconds} seconds.`
              : "Too many attempts. Try again later.",
          };
        }

        if (err.status === 409 || err.status === 400) {
          if (err.fields && Object.keys(err.fields).length > 0) {
            const rowErrors = mapFieldErrors(err.fields, rowIdByIndex);
            if (Object.keys(rowErrors).length > 0) {
              return { kind: "rowErrors", byRowId: rowErrors };
            }
          }
          return {
            kind: "alert",
            message: err.message || "Check the highlighted fields",
          };
        }
      }

      return {
        kind: "alert",
        message: "Something went wrong. Please try again.",
      };
    }
  };

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
