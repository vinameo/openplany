import {
  ActionIcon,
  Alert,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  PROJECT_NAME_MAX,
  type ProjectListItem,
} from "@repo/contracts";
import { InfoIcon } from "../../../workspaces/icons";
import { SETTINGS_MESSAGES } from "../../../settings/settingsMessages";
import { ProjectCoverHeader } from "../../ProjectCoverHeader";
import { PROJECT_SETTINGS_MESSAGES } from "../projectSettingsMessages";
import { useProjectGeneralSettingsForm } from "./useProjectGeneralSettingsForm";
import classes from "./ProjectGeneralSettingsForm.module.css";

interface ProjectGeneralSettingsFormProps {
  project: ProjectListItem;
}

export function ProjectGeneralSettingsForm({
  project,
}: ProjectGeneralSettingsFormProps) {
  const {
    form,
    hasChanges,
    isSaving,
    submitError,
    handleSubmit,
    canEdit,
  } = useProjectGeneralSettingsForm(project);

  const nameLength = form.values.name ? form.values.name.length : 0;
  const remaining = PROJECT_NAME_MAX - nameLength;
  const nameDescription =
    remaining <= 10 ? `${remaining} characters left` : undefined;

  return (
    <div style={{ maxWidth: 880 }}>
      <ProjectCoverHeader
        coverKey={form.values.coverKey}
        icon={{ name: form.values.iconName, color: form.values.iconColor }}
        variant="page"
      >
        <div className={classes.coverOverlay}>
          <div className={classes.coverProjectName}>{project.name}</div>
          <div className={classes.coverProjectIdentifier}>
            {project.identifier}
          </div>
        </div>
      </ProjectCoverHeader>

      <form className={classes.formSection} onSubmit={handleSubmit} noValidate>
        {!canEdit && (
          <Alert variant="light" color="gray" mb="lg">
            {SETTINGS_MESSAGES.readOnly}
          </Alert>
        )}

        <Stack gap="lg">
          <TextInput
            label="Project name"
            required
            readOnly={!canEdit}
            description={nameDescription}
            key={form.key("name")}
            {...form.getInputProps("name")}
          />

          <Textarea
            label="Description"
            minRows={4}
            maxRows={10}
            readOnly={!canEdit}
            key={form.key("description")}
            {...form.getInputProps("description")}
          />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <TextInput
              label="Project ID"
              value={project.identifier}
              readOnly
              rightSection={
                <Tooltip
                  label={PROJECT_SETTINGS_MESSAGES.identifierReadOnly}
                  position="top-end"
                  multiline
                  w={260}
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="About project ID"
                  >
                    <InfoIcon width={16} height={16} />
                  </ActionIcon>
                </Tooltip>
              }
            />
          </SimpleGrid>

          {submitError && (
            <Alert color="red" role="alert" mt="sm">
              {submitError}
            </Alert>
          )}

          {canEdit && (
            <Group justify="flex-start" mt="md">
              <Button
                type="submit"
                loading={isSaving}
                disabled={!hasChanges || !form.isValid()}
              >
                Update project
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </div>
  );
}
