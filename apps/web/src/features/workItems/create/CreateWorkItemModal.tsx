import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  normalizeWorkItemDescription,
  normalizeWorkItemTitle,
  workItemDescriptionProblem,
  workItemTitleProblem,
  type ProjectListItem,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { translateRef } from "../../../i18n/language";
import { useIsDesktop } from "../../layout/useIsDesktop";
import { ProjectIcon } from "../../projects/ProjectIcon";
import { useCreateWorkItem } from "../api/useCreateWorkItem";
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
  const createMutation = useCreateWorkItem();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    crypto.randomUUID(),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const titleProb = workItemTitleProblem(title);
    if (titleProb) {
      setTitleError(translateRef(t, titleProb));
      return;
    }
    setTitleError(null);

    const descProb = workItemDescriptionProblem(description);
    if (descProb) {
      setDescriptionError(translateRef(t, descProb));
      return;
    }
    setDescriptionError(null);

    const normTitle = normalizeWorkItemTitle(title);
    const normDesc = normalizeWorkItemDescription(description);

    try {
      const res = await createMutation.mutateAsync({
        slug,
        identifier: project.identifier,
        body: {
          title: normTitle,
          description: normDesc,
          idempotencyKey,
        },
      });

      notifications.show({
        title: t("workItem:create.created", { key: res.workItem.key }),
        message: res.workItem.title,
      });

      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          setServerError(t("workItem:errors.createForbidden"));
          reloadProject?.();
        } else if (err.status === 404) {
          setServerError(t("workItem:errors.projectGone"));
          reloadProject?.();
        } else if (err.code === "WORK_ITEM_REQUEST_REUSED") {
          setServerError(t("workItem:errors.requestReused"));
          setIdempotencyKey(crypto.randomUUID());
        } else {
          setServerError(t("workItem:errors.generic"));
        }
      } else {
        setServerError(t("workItem:errors.generic"));
      }
    }
  };

  const isSaving = createMutation.isPending;

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
            onChange={(e) => {
              setTitle(e.currentTarget.value);
              if (titleError) setTitleError(null);
            }}
            error={titleError}
            readOnly={isSaving}
          />

          <Textarea
            label={t("workItem:fields.descriptionLabel")}
            placeholder={t("workItem:fields.descriptionPlaceholder")}
            aria-label={t("workItem:fields.descriptionLabel")}
            value={description}
            onChange={(e) => {
              setDescription(e.currentTarget.value);
              if (descriptionError) setDescriptionError(null);
            }}
            error={descriptionError}
            rows={5}
            readOnly={isSaving}
          />

          <Group justify="flex-end" className={classes.footer}>
            <Button
              variant="default"
              onClick={onClose}
              disabled={isSaving}
            >
              {t("workItem:create.discard")}
            </Button>
            <Button
              type="submit"
              loading={isSaving}
            >
              {t("workItem:create.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
