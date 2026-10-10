import { Alert, Button, Select, SimpleGrid, TextInput } from "@mantine/core";
import {
  ORGANIZATION_SIZES,
  WORKSPACE_NAME_MAX,
  type WorkspaceResponse,
} from "@repo/contracts";
import classes from "./GeneralSettingsForm.module.css";
import { TimezoneSelect } from "./TimezoneSelect";
import { useGeneralSettingsForm } from "./useGeneralSettingsForm";
import { WorkspaceUrlField } from "./WorkspaceUrlField";

interface GeneralSettingsFormProps {
  workspace: WorkspaceResponse;
}

export function GeneralSettingsForm({ workspace }: GeneralSettingsFormProps) {
  const {
    form,
    hasChanges,
    isSaving,
    submitError,
    handleSubmit,
    canEdit,
  } = useGeneralSettingsForm(workspace);

  const nameLength = form.values.name ? form.values.name.length : 0;
  const remaining = WORKSPACE_NAME_MAX - nameLength;
  const nameDescription =
    remaining <= 10 ? `${remaining} characters left` : undefined;

  return (
    <form className={classes.form} onSubmit={handleSubmit} noValidate>
      {!canEdit && (
        <Alert variant="light" color="gray" mb="lg">
          You don't have permission to change these settings.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {/* 1. Workspace name */}
        <TextInput
          label="Workspace name"
          required
          readOnly={!canEdit}
          description={nameDescription}
          key={form.key("name")}
          {...form.getInputProps("name")}
        />

        {/* 2. Company size */}
        <Select
          label="Company size"
          data={ORGANIZATION_SIZES}
          allowDeselect={false}
          searchable={false}
          checkIconPosition="right"
          readOnly={!canEdit}
          disabled={!canEdit}
          key={form.key("organizationSize")}
          {...form.getInputProps("organizationSize")}
        />

        {/* 3. Workspace URL */}
        <WorkspaceUrlField slug={workspace.slug} />

        {/* 4. Workspace Timezone */}
        <TimezoneSelect
          value={form.values.timezone}
          onChange={(val) => form.setFieldValue("timezone", val)}
          readOnly={!canEdit}
          disabled={!canEdit}
          error={form.errors.timezone}
        />
      </SimpleGrid>

      {submitError && (
        <Alert color="red" role="alert" mt="lg">
          {submitError}
        </Alert>
      )}

      {canEdit && (
        <div className={classes.submitWrapper}>
          <Button
            type="submit"
            loading={isSaving}
            disabled={!hasChanges || !form.isValid()}
          >
            Update workspace
          </Button>
        </div>
      )}
    </form>
  );
}

