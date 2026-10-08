import { Stack } from "@mantine/core";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { GeneralSettingsForm } from "./GeneralSettingsForm";
import { WorkspaceIdentityCard } from "./WorkspaceIdentityCard";

export function GeneralSettingsPage() {
  const { workspace } = useCurrentWorkspace();

  return (
    <Stack gap="xl">
      <WorkspaceIdentityCard workspace={workspace} />
      <GeneralSettingsForm workspace={workspace} />
    </Stack>
  );
}

