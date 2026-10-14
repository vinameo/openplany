import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  CloseButton,
  Divider,
  Group,
  Modal,
  Stack,
  Textarea,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { ProjectListItem } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useIsDesktop } from "../../layout/useIsDesktop";
import { splitServerFieldErrors } from "../../settings/serverFieldErrors";
import { ConfirmDiscardModal } from "../../workspaces/ConfirmDiscardModal";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { projectsApi } from "../api/projectsApi";
import { ProjectCoverHeader } from "../ProjectCoverHeader";
import { useCreateProjectForm } from "./useCreateProjectForm";
import classes from "./CreateProjectModal.module.css";

interface CreateProjectModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (project: ProjectListItem) => void;
  slug: string;
}

export function CreateProjectModal({
  opened,
  onClose,
  onCreated,
  slug,
}: CreateProjectModalProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const [submitting, setSubmitting] = useState(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [rateLimitAlert, setRateLimitAlert] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [confirmDiscardOpened, setConfirmDiscardOpened] = useState(false);

  const {
    form,
    handleNameChange,
    handleIdentifierChange,
    resetForm,
    isDirty,
    toRequest,
  } = useCreateProjectForm();

  const wasOpened = useRef(opened);
  useEffect(() => {
    if (opened && !wasOpened.current) {
      resetForm();
    }
    wasOpened.current = opened;
  }, [opened, resetForm]);

  const handleRequestClose = () => {
    if (isDirty) {
      setConfirmDiscardOpened(true);
    } else {
      resetForm();
      setErrorAlert(null);
      setRateLimitAlert(null);
      setForbidden(false);
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setConfirmDiscardOpened(false);
    resetForm();
    setErrorAlert(null);
    setRateLimitAlert(null);
    setForbidden(false);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || forbidden) return;

    const validation = form.validate();
    if (validation.hasErrors) return;

    setSubmitting(true);
    setErrorAlert(null);
    setRateLimitAlert(null);

    try {
      const res = await projectsApi.create(slug, toRequest(form.values));
      notifications.show({ message: t("project:create.successNotification") });
      onCreated(res.project);
      resetForm();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiRequestError) {
        if (err.status === 400 || err.status === 409) {
          const { fieldErrors, hiddenMessages } = splitServerFieldErrors(
            err.fields,
            FORM_FIELDS,
          );
          form.setErrors(fieldErrors);
          // Errors on fields without an input (icon.*, coverKey, unknown keys)
          // would otherwise change nothing on screen.
          const hasHiddenErrors = hiddenMessages.length > 0;
          if (hasHiddenErrors || Object.keys(fieldErrors).length === 0) {
            setErrorAlert(
              hasHiddenErrors
                ? t("project:create.checkIconCover")
                : err.message || t("project:create.checkFields"),
            );
          }
          return;
        }
        if (err.status === 403) {
          setErrorAlert(t("project:create.forbidden"));
          setForbidden(true);
          void reloadWorkspace();
          return;
        }
        if (err.status === 429) {
          setRateLimitAlert(t("project:create.tooManyAttempts"));
          return;
        }
      }
      setErrorAlert(t("project:create.genericError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleRequestClose}
        withCloseButton={false}
        padding={0}
        size="xl"
        fullScreen={!isDesktop}
        aria-labelledby="create-project-title"
      >
        <form onSubmit={handleSubmit}>
          <ProjectCoverHeader
            coverKey={form.values.coverKey}
            icon={form.values.icon}
            onCoverChange={(newCover) => form.setFieldValue("coverKey", newCover)}
            onIconChange={(newIcon) => form.setFieldValue("icon", newIcon)}
            variant="modal"
          >
            <VisuallyHidden>
              <h2 id="create-project-title">{t("project:create.title")}</h2>
            </VisuallyHidden>
            <CloseButton
              aria-label={t("common:actions.close")}
              onClick={handleRequestClose}
              className={classes.closeButton}
            />
          </ProjectCoverHeader>

          <div className={classes.body}>
            <Stack gap="md">
              {errorAlert && (
                <Alert color="red" role="alert">
                  {errorAlert}
                </Alert>
              )}
              {rateLimitAlert && (
                <Alert color="yellow" role="alert">
                  {rateLimitAlert}
                </Alert>
              )}

              <div className={classes.nameRow}>
                <TextInput
                  data-autofocus
                  aria-label={t("project:create.nameLabel")}
                  placeholder={t("project:create.namePlaceholder")}
                  className={classes.nameInput}
                  value={form.values.name}
                  onChange={handleNameChange}
                  error={form.errors.name}
                />
                <TextInput
                  aria-label={t("project:create.identifierLabel")}
                  placeholder={t("project:create.identifierPlaceholder")}
                  className={classes.idInput}
                  value={form.values.identifier}
                  onChange={handleIdentifierChange}
                  error={form.errors.identifier}
                />
              </div>

              <Textarea
                minRows={4}
                maxRows={10}
                aria-label={t("project:create.descriptionLabel")}
                placeholder={t("project:create.descriptionPlaceholder")}
                value={form.values.description}
                onChange={(e) =>
                  form.setFieldValue("description", e.currentTarget.value)
                }
                error={form.errors.description}
              />
            </Stack>
          </div>

          <Divider />

          <Group justify="flex-end" className={classes.footer} gap="xs">
            <Button variant="default" onClick={handleRequestClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" loading={submitting} disabled={forbidden}>
              {t("project:create.submitButton")}
            </Button>
          </Group>
        </form>
      </Modal>

      <ConfirmDiscardModal
        opened={confirmDiscardOpened}
        onClose={() => setConfirmDiscardOpened(false)}
        onDiscard={handleConfirmDiscard}
      />
    </>
  );
}

/** Inputs that can show a server error under themselves. */
const FORM_FIELDS = ["name", "identifier", "description"] as const;

