import { useEffect, useRef, useState } from "react";
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
      notifications.show({ message: "Project created" });
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
                ? "Check the icon and cover, then try again."
                : err.message || "Check the highlighted fields",
            );
          }
          return;
        }
        if (err.status === 403) {
          setErrorAlert("You no longer have permission to create projects");
          setForbidden(true);
          void reloadWorkspace();
          return;
        }
        if (err.status === 429) {
          setRateLimitAlert("Too many attempts. Try again later.");
          return;
        }
      }
      setErrorAlert("Couldn't create the project. Try again.");
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
              <h2 id="create-project-title">Create project</h2>
            </VisuallyHidden>
            <CloseButton
              aria-label="Close"
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
                  aria-label="Project name"
                  placeholder="Project name"
                  className={classes.nameInput}
                  value={form.values.name}
                  onChange={handleNameChange}
                  error={form.errors.name}
                />
                <TextInput
                  aria-label="Project ID"
                  placeholder="ID"
                  className={classes.idInput}
                  value={form.values.identifier}
                  onChange={handleIdentifierChange}
                  error={form.errors.identifier}
                />
              </div>

              <Textarea
                minRows={4}
                maxRows={10}
                aria-label="Description"
                placeholder="Description"
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
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={forbidden}>
              Create project
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

