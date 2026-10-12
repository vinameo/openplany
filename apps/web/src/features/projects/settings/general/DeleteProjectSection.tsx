import { useState } from "react";
import { Button, Group } from "@mantine/core";
import type { ProjectListItem } from "@repo/contracts";
import { SettingsSection } from "../../../settings/SettingsSection";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { DeleteProjectModal } from "./DeleteProjectModal";

export interface DeleteProjectSectionProps {
  project: ProjectListItem;
}

export function DeleteProjectSection({ project }: DeleteProjectSectionProps) {
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
        title="Delete"
        description="When deleting a project, all of the data and resources within that project will be permanently removed and cannot be recovered."
      >
        <Group justify="flex-start" mt="md">
          <Button
            variant="outline"
            color="red"
            onClick={() => setModalOpened(true)}
          >
            Delete
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
