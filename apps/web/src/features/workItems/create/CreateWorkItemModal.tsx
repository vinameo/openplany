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
import type { ProjectListItem } from "@repo/contracts";
import { MarkdownEditor } from "../../markdown/MarkdownEditor";
import { useIsDesktop } from "../../layout/useIsDesktop";
import { ProjectIcon } from "../../projects/ProjectIcon";
import { useCreateWorkItemForm } from "./useCreateWorkItemForm";
import classes from "./CreateWorkItemModal.module.css";

export interface CreateWorkItemModalProps {
  opened: boolean;
  onClose: () => void;
  slug: string;
  project: ProjectListItem;
  reloadProject?: () => void;
}

export function CreateWorkItemModal({
  opened,
  onClose,
  slug,
  project,
  reloadProject,
}: CreateWorkItemModalProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();

  const {
    title,
    setTitle,
    description,
    setDescription,
    titleError,
    descriptionError,
    serverError,
    isSaving,
    isSaveLocked,
    handleSubmit,
  } = useCreateWorkItemForm({
    slug,
    project,
    onSuccess: onClose,
    reloadProject,
  });

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      title={
        <Text fw={600} size="lg" id="create-work-item-title">
          {t("workItem:create.title")}
        </Text>
      }
      aria-labelledby="create-work-item-title"
      fullScreen={!isDesktop}
      size="lg"
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {serverError && (
            <Alert color="red" role="alert">
              {serverError}
            </Alert>
          )}

          <div
            className={classes.projectChip}
            aria-label={t("workItem:create.projectChip", {
              name: project.name,
            })}
          >
            <ProjectIcon icon={project.icon} size={16} />
            <Text size="sm" fw={500}>
              {project.name}
            </Text>
          </div>

          <TextInput
            data-autofocus
            placeholder={t("workItem:fields.title")}
            aria-label={t("workItem:fields.title")}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            error={titleError}
            readOnly={isSaving}
          />

          <MarkdownEditor
            label={t("workItem:fields.descriptionLabel")}
            placeholder={t("workItem:fields.descriptionPlaceholder")}
            value={description}
            onChange={setDescription}
            error={descriptionError}
            readOnly={isSaving}
          />

          <Group justify="flex-end" className={classes.footer}>
            <Button variant="default" onClick={onClose} disabled={isSaving}>
              {t("workItem:create.discard")}
            </Button>
            <Button
              type="submit"
              loading={isSaving}
              disabled={isSaving || isSaveLocked}
            >
              {t("workItem:create.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
