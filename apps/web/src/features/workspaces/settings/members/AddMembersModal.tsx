import { useMemo, useReducer, useState } from "react";
import {
  Alert,
  Button,
  CloseButton,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  ADD_MEMBERS_MAX,
  DEFAULT_ADDED_WORKSPACE_ROLE,
  WORKSPACE_CREATOR_ROLE,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLE_RANK,
  type WorkspaceRole,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { PlusIcon } from "../../icons";
import {
  addMemberRowsReducer,
  createInitialRow,
  mapFieldErrors,
  toAddMembersRequest,
  type AddMemberRow,
} from "./addMembersRows";
import { membersApi } from "./api/membersApi";
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
  const isMobile = useMediaQuery("(max-width: 48em)");
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

  const [rows, dispatch] = useReducer(
    (currentRows: AddMemberRow[], action: Parameters<typeof addMemberRowsReducer>[1]) =>
      addMemberRowsReducer(currentRows, action, { defaultRole }),
    [createInitialRow(defaultRole)],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalAlert, setGlobalAlert] = useState<string | null>(null);
  const [confirmDiscardOpened, setConfirmDiscardOpened] = useState(false);

  const highestAddableRole = sortedAddableRoles[sortedAddableRoles.length - 1];

  const handleAttemptClose = () => {
    const hasCandidate = rows.some((r) => r.candidate !== null);
    if (hasCandidate) {
      setConfirmDiscardOpened(true);
    } else {
      handleForceClose();
    }
  };

  const handleForceClose = () => {
    setConfirmDiscardOpened(false);
    setGlobalAlert(null);
    dispatch({ type: "reset" });
    onClose();
  };

  const handleSubmit = async () => {
    const { body, rowIdByIndex } = toAddMembersRequest(rows);
    if (body.members.length === 0) return;

    setIsSubmitting(true);
    setGlobalAlert(null);

    try {
      const res = await membersApi.add(slug, body);
      const count = res.members.length;
      notifications.show({
        message: `Added ${count} member${count === 1 ? "" : "s"}`,
      });
      handleForceClose();
      await reloadWorkspace();
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          handleForceClose();
          notifications.show({
            color: "red",
            message: err.message || "You don't have permission to do this",
          });
          await reloadWorkspace();
          return;
        }

        if (err.status === 429) {
          const seconds = err.retryAfterSeconds;
          setGlobalAlert(
            seconds
              ? `Too many attempts. Try again in ${seconds} seconds.`
              : "Too many attempts. Try again later.",
          );
          return;
        }

        if (err.status === 409 || err.status === 400) {
          if (err.fields && Object.keys(err.fields).length > 0) {
            const rowErrors = mapFieldErrors(err.fields, rowIdByIndex);
            if (Object.keys(rowErrors).length > 0) {
              dispatch({ type: "errors", byRowId: rowErrors });
              return;
            }
          }
          setGlobalAlert(err.message || "Check the highlighted fields");
          return;
        }
      }

      setGlobalAlert("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = useMemo(
    () =>
      sortedAddableRoles.map((role) => ({
        value: role,
        label: WORKSPACE_ROLE_LABELS[role],
      })),
    [sortedAddableRoles],
  );

  const hasAnySelected = rows.some((r) => r.candidate !== null);

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleAttemptClose}
        title="Add member"
        size="lg"
        fullScreen={isMobile}
        withinPortal={false}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Add members to collaborate in your workspace.
          </Text>

          {globalAlert && (
            <Alert color="red" role="alert">
              {globalAlert}
            </Alert>
          )}

          <Stack gap="sm">
            {rows.map((row) => {
              const isAdminNotice =
                row.role === highestAddableRole &&
                row.role === WORKSPACE_CREATOR_ROLE;

              const otherSelectedIds = rows
                .filter((r) => r.id !== row.id && r.candidate !== null)
                .map((r) => r.candidate!.userId);

              return (
                <div key={row.id}>
                  <Group
                    gap="xs"
                    align="flex-start"
                    wrap={isMobile ? "wrap" : "nowrap"}
                  >
                    <div style={{ flex: 1, minWidth: isMobile ? "100%" : 280 }}>
                      <MemberCandidateSelect
                        slug={slug}
                        value={row.candidate}
                        onChange={(candidate) =>
                          dispatch({
                            type: "select",
                            id: row.id,
                            candidate,
                          })
                        }
                        selectedUserIds={otherSelectedIds}
                        error={row.error}
                        disabled={isSubmitting}
                      />
                    </div>

                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 160 }}>
                      <Select
                        aria-label="Role"
                        data={roleOptions}
                        value={row.role}
                        onChange={(val) => {
                          if (val) {
                            dispatch({
                              type: "role",
                              id: row.id,
                              role: val as WorkspaceRole,
                            });
                          }
                        }}
                        disabled={isSubmitting}
                        comboboxProps={{ withinPortal: false }}
                        allowDeselect={false}
                        style={{ width: 140 }}
                      />

                      {rows.length > 1 && (
                        <CloseButton
                          aria-label="Remove row"
                          onClick={() =>
                            dispatch({ type: "remove", id: row.id })
                          }
                          disabled={isSubmitting}
                          size="lg"
                        />
                      )}
                    </Group>
                  </Group>

                  {isAdminNotice && (
                    <Text size="xs" c="dimmed" mt={4}>
                      Admins can manage everyone in this workspace, including you.
                    </Text>
                  )}
                </div>
              );
            })}
          </Stack>

          {rows.length < ADD_MEMBERS_MAX && (
            <div>
              <Button
                variant="subtle"
                size="xs"
                leftSection={<PlusIcon width={14} height={14} />}
                onClick={() => dispatch({ type: "add" })}
                disabled={isSubmitting}
              >
                + Add more
              </Button>
            </div>
          )}

          <Group justify="flex-end" gap="xs" mt="md">
            <Button
              variant="default"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasAnySelected || isSubmitting}
              loading={isSubmitting}
            >
              Add member
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={confirmDiscardOpened}
        onClose={() => setConfirmDiscardOpened(false)}
        title="Discard changes?"
        centered
        size="sm"
        withinPortal={false}
      >
        <Stack gap="md">
          <Text size="sm">
            You have unsaved changes. Are you sure you want to discard them?
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => setConfirmDiscardOpened(false)}
            >
              Keep editing
            </Button>
            <Button color="red" onClick={handleForceClose}>
              Discard
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
