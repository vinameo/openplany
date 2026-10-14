import { useState } from "react";
import { Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ProjectListItem } from "@repo/contracts";
import { SettingsSection } from "../../../settings/SettingsSection";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { DeleteProjectModal } from "./DeleteProjectModal";

export interface DeleteProjectSectionProps {
  project: ProjectListItem;
}

export function DeleteProjectSection({ project }: DeleteProjectSectionProps) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const [modalOpened, setModalOpened] = useState(false);

  const canDelete = workspace.permissions.includes("workspace.projects.delete");
  if (!canDelete) {
    return null;
  }

  return (
    <>
      <SettingsSection
        variant="danger"
        title={t("project:settings.delete.title")}
        description={t("project:settings.delete.description")}
      >
        <Group justify="flex-start" mt="md">
          <Button
            variant="outline"
            color="red"
            onClick={() => setModalOpened(true)}
          >
            {t("project:settings.delete.button")}
          </Button>
        </Group>
      </SettingsSection>

      <DeleteProjectModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        project={project}
        slug={workspace.slug}
      />
    </>
  );
}
