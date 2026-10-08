import { GeneralSettingsPage } from "./general/GeneralSettingsPage";
import { SettingsIndexRedirect } from "./SettingsIndexRedirect";
import { SettingsSectionNotFound } from "./SettingsSectionNotFound";
import { SettingsSectionRoute } from "./SettingsSectionRoute";
import { WorkspaceSettingsLayout } from "./WorkspaceSettingsLayout";

export function GeneralSettingsRoute() {
  return (
    <SettingsSectionRoute sectionKey="general">
      <GeneralSettingsPage />
    </SettingsSectionRoute>
  );
}

export {
  SettingsIndexRedirect,
  SettingsSectionNotFound,
  WorkspaceSettingsLayout,
};

