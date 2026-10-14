import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  PROJECT_NAME_MAX,
  type ProjectListItem,
} from "@repo/contracts";
import { InfoIcon } from "../../../workspaces/icons";
import { SETTINGS_MESSAGES } from "../../../settings/settingsMessages";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { formatCalendarDate } from "../../../workspaces/table/formatCalendarDate";
import { TimezoneSelect } from "../../../timezones/TimezoneSelect";
import { timezoneOptionLabel } from "../../../timezones/timezoneOptions";
import { ProjectCoverHeader } from "../../ProjectCoverHeader";
import { PROJECT_SETTINGS_MESSAGES } from "../projectSettingsMessages";
import { FOLLOW_WORKSPACE_TIMEZONE } from "../projectSettingsValues";
import { DeleteProjectSection } from "./DeleteProjectSection";
import { useProjectGeneralSettingsForm } from "./useProjectGeneralSettingsForm";
import classes from "./ProjectGeneralSettingsForm.module.css";

interface ProjectGeneralSettingsFormProps {
  project: ProjectListItem;
}

export function ProjectGeneralSettingsForm({
  project,
}: ProjectGeneralSettingsFormProps) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
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
    remaining <= 10
      ? t("common:charactersLeft", { count: remaining })
      : undefined;

  return (
    <div style={{ maxWidth: 880 }}>
      <ProjectCoverHeader
        coverKey={form.values.coverKey}
        icon={{ name: form.values.iconName, color: form.values.iconColor }}
        onCoverChange={
          canEdit
            ? (newCover) => form.setFieldValue("coverKey", newCover)
            : undefined
        }
        onIconChange={
          canEdit
            ? (newIcon) => {
                form.setFieldValue("iconName", newIcon.name);
                form.setFieldValue("iconColor", newIcon.color);
              }
            : undefined
        }
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
            label={t("project:settings.general.nameLabel")}
            required
            readOnly={!canEdit}
            description={nameDescription}
            key={form.key("name")}
            {...form.getInputProps("name")}
          />

          <Textarea
            label={t("project:settings.general.descriptionLabel")}
            placeholder={t("project:settings.general.descriptionPlaceholder")}
            minRows={4}
            maxRows={10}
            readOnly={!canEdit}
            key={form.key("description")}
            {...form.getInputProps("description")}
          />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <TextInput
              label={t("project:settings.general.identifierLabel")}
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
                    aria-label={t("project:settings.general.aboutIdentifierAriaLabel")}
                  >
                    <InfoIcon width={16} height={16} />
                  </ActionIcon>
                </Tooltip>
              }
            />

            <TimezoneSelect
              label={t("project:settings.general.timezoneLabel")}
              description={t("project:settings.general.timezoneDescription")}
              inputWrapperOrder={["label", "input", "description", "error"]}
              value={form.values.timezone}
              onChange={(val) => form.setFieldValue("timezone", val)}
              readOnly={!canEdit}
              disabled={!canEdit}
              error={form.errors.timezone}
              followOption={{
                value: FOLLOW_WORKSPACE_TIMEZONE,
                label: t("project:settings.general.workspaceTimezoneFollow", {
                  timezone: timezoneOptionLabel(workspace.timezone),
                }),
              }}
            />
          </SimpleGrid>

          {submitError && (
            <Alert color="red" role="alert" mt="sm">
              {submitError}
            </Alert>
          )}

          <Group justify="space-between" align="center" mt="md">
            {canEdit ? (
              <Button
                type="submit"
                loading={isSaving}
                disabled={!hasChanges || !form.isValid()}
              >
                {t("project:settings.general.submitButton")}
              </Button>
            ) : (
              <div />
            )}
            <Text c="dimmed" fs="italic" size="sm">
              {t("project:settings.general.createdOn", {
                date: formatCalendarDate(
                  project.createdAt,
                  project.effectiveTimezone,
                ),
              })}
            </Text>
          </Group>
        </Stack>
      </form>

      <Box mt={48}>
        <DeleteProjectSection project={project} />
      </Box>
    </div>
  );
}
