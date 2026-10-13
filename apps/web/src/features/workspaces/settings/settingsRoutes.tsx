import { GeneralSettingsPage } from "./general/GeneralSettingsPage";
import { SettingsIndexRedirect } from "./SettingsIndexRedirect";
import { SettingsSectionNotFound } from "./SettingsSectionNotFound";
import { SettingsSectionRoute } from "./SettingsSectionRoute";
import { WorkspaceSettingsLayout } from "./WorkspaceSettingsLayout";

import { MembersSettingsPage } from "./members/MembersSettingsPage";

export function GeneralSettingsRoute() {
  return (
    <SettingsSectionRoute>
      <GeneralSettingsPage />
    </SettingsSectionRoute>
  );
}

export function MembersSettingsRoute() {
  return (
    <SettingsSectionRoute>
      <MembersSettingsPage />
    </SettingsSectionRoute>
  );
}

export {
  SettingsIndexRedirect,
  SettingsSectionNotFound,
  WorkspaceSettingsLayout,
};


