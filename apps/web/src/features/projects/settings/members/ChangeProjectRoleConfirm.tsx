import { Alert, Stack, Text } from "@mantine/core";
import {
  PROJECT_ROLE_LABELS,
  type ProjectMemberResponse,
  type ProjectRole,
} from "@repo/contracts";
import { RoleChangeConfirmModal } from "../../../members/RoleChangeConfirmModal";
import { memberDisplayName } from "../../../members/memberListView";
import {
  changeRoleTitle,
  lastAdminWarning,
  loseAdminBody,
  makeAdminBody,
  makeAdminTitle,
} from "./projectMembersMessages";

export interface ChangeProjectRoleConfirmState {
  member: ProjectMemberResponse;
  nextRole: ProjectRole;
  kind: "gain_admin" | "lose_admin";
  lastAssignedAdmin: boolean;
}

export interface ChangeProjectRoleConfirmProps {
  opened: boolean;
  state: ChangeProjectRoleConfirmState | null;
  projectName: string;
  pending: boolean;
  error: string | null;
  onConfirm(): void;
  onCancel(): void;
}

export function ChangeProjectRoleConfirm({
  opened,
  state,
  projectName,
  pending,
  error,
  onConfirm,
  onCancel,
}: ChangeProjectRoleConfirmProps) {
  if (!state) {
    return null;
  }

  const displayName = memberDisplayName(state.member);
  const nextRoleLabel = PROJECT_ROLE_LABELS[state.nextRole] ?? state.nextRole;
  const isGainAdmin = state.kind === "gain_admin";

  const title = isGainAdmin
    ? makeAdminTitle(displayName)
    : changeRoleTitle(displayName, nextRoleLabel);

  const confirmLabel = isGainAdmin
    ? "Make Project Admin"
    : `Change to ${nextRoleLabel}`;

  return (
    <RoleChangeConfirmModal
      opened={opened}
      title={title}
      confirmLabel={confirmLabel}
      danger={!isGainAdmin}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {isGainAdmin ? (
        <Text size="sm">{makeAdminBody(displayName)}</Text>
      ) : (
        <Stack gap="sm">
          <Text size="sm">{loseAdminBody(displayName)}</Text>
          {state.lastAssignedAdmin ? (
            <Alert color="yellow" variant="light">
              {lastAdminWarning(projectName)}
            </Alert>
          ) : null}
        </Stack>
      )}
    </RoleChangeConfirmModal>
  );
}
