import { Text } from "@mantine/core";
import { Navigate } from "react-router";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import { visibleSettingsSections } from "./settingsSections";

export function SettingsIndexRedirect() {
  const { workspace } = useCurrentWorkspace();
  const visible = visibleSettingsSections(workspace.permissions);

  if (visible.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Text c="dimmed">You don't have access to workspace settings.</Text>
      </div>
    );
  }

  return <Navigate to={visible[0].key} replace />;
}

