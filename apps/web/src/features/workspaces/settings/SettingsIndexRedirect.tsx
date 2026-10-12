import { Text } from "@mantine/core";
import { Navigate } from "react-router";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import { firstOpenableSection } from "../../settings/settingsNavigation";
import { WORKSPACE_SETTINGS_SECTIONS } from "./settingsSections";

export function SettingsIndexRedirect() {
  const { workspace } = useCurrentWorkspace();
  const first = firstOpenableSection(
    WORKSPACE_SETTINGS_SECTIONS,
    workspace.permissions,
  );

  if (!first) {
    return (
      <div style={{ padding: 24 }}>
        <Text c="dimmed">You don't have access to workspace settings.</Text>
      </div>
    );
  }

  return <Navigate to={first.key} replace />;
}
