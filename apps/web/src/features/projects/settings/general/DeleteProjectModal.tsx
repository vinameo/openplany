import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { ProjectListItem } from "@repo/contracts";
import { ApiRequestError, GENERIC_ERROR_KEY } from "../../../../lib/apiClient";
import { useIsDesktop } from "../../../layout/useIsDesktop";
import { useAuth } from "../../../auth/useAuth";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { workspacePath } from "../../../workspaces/workspacePaths";
import { removeProjectFromCache } from "../../api/projectQueries";
import { useDeleteProject } from "../../api/useDeleteProject";
import { PROJECT_SETTINGS_MESSAGES } from "../projectSettingsMessages";
import { tooManyChangesMessage } from "../../../settings/settingsMessages";
import { matchesProjectIdentifier } from "./matchesProjectIdentifier";

export interface DeleteProjectModalProps {
  opened: boolean;
  onClose: () => void;
  project: Pick<ProjectListItem, "name" | "identifier">;
  slug: string;
}

export function DeleteProjectModal({
  opened,
  onClose,
  project,
  slug,
}: DeleteProjectModalProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const { expireSession } = useAuth();
  const deleteMutation = useDeleteProject(slug);

  const [confirmationInput, setConfirmationInput] = useState("");
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const handleClose = () => {
    setConfirmationInput("");
    setErrorAlert(null);
    onClose();
  };

  const isMatching = matchesProjectIdentifier(
    confirmationInput,
    project.identifier,
  );

  const handleDelete = async () => {
    if (!isMatching || deleteMutation.isPending) {
      return;
    }
    setErrorAlert(null);

    try {
      await deleteMutation.mutateAsync(project.identifier);
      handleClose();
      notifications.show({
        message: t("project:settings.delete.successNotification"),
        color: "teal",
      });
      await Promise.resolve(
        navigate(workspacePath(slug), { replace: true }),
      )
        .then(() =>
          removeProjectFromCache(queryClient, slug, project.identifier),
        )
        .catch((err: unknown) =>
          console.error("project.delete.leave_failed", err),
        );
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          setErrorAlert(PROJECT_SETTINGS_MESSAGES.deleteForbidden);
          void reloadWorkspace();
          return;
        }
        if (err.status === 404) {
          handleClose();
          notifications.show({
            message: t("project:errors.notFound"),
            color: "red",
          });
          await Promise.resolve(
            navigate(workspacePath(slug), { replace: true }),
          )
            .then(() =>
              removeProjectFromCache(queryClient, slug, project.identifier),
            )
            .catch((leaveErr: unknown) =>
              console.error("project.delete.leave_failed", leaveErr),
            );
          return;
        }
        if (err.status === 429) {
          setErrorAlert(tooManyChangesMessage(err.retryAfterSeconds ?? null));
          return;
        }
        if (err.status === 401) {
          expireSession();
          return;
        }
      }
      setErrorAlert(t(GENERIC_ERROR_KEY));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("project:settings.delete.modalTitle")}
      size="md"
      fullScreen={!isDesktop}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleDelete();
        }}
      >
        <Stack gap="md">
          {errorAlert && (
            <Alert color="red" variant="light" role="alert">
              {errorAlert}
            </Alert>
          )}

          <Text size="sm">
            {t("project:settings.delete.warning", { name: project.name })}
          </Text>

          <TextInput
            label={t("project:settings.delete.confirmLabel", {
              identifier: project.identifier,
            })}
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.currentTarget.value)}
            data-autofocus
            autoComplete="off"
          />

          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={handleClose}
              disabled={deleteMutation.isPending}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              color="red"
              type="submit"
              disabled={!isMatching}
              loading={deleteMutation.isPending}
            >
              {t("project:settings.delete.confirmButton")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
