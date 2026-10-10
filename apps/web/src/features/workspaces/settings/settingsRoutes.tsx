import { GeneralSettingsPage } from "./general/GeneralSettingsPage";
import { SettingsIndexRedirect } from "./SettingsIndexRedirect";
import { SettingsSectionNotFound } from "./SettingsSectionNotFound";
import { SettingsSectionRoute } from "./SettingsSectionRoute";
import { WorkspaceSettingsLayout } from "./WorkspaceSettingsLayout";

import { MembersSettingsPage } from "./members/MembersSettingsPage";

export function GeneralSettingsRoute() {
  return (
    <SettingsSectionRoute sectionKey="general">
      <GeneralSettingsPage />
    </SettingsSectionRoute>
  );
}

export function MembersSettingsRoute() {
  return (
    <SettingsSectionRoute sectionKey="members">
      <MembersSettingsPage />
    </SettingsSectionRoute>
  );
}

export {
  SettingsIndexRedirect,
  SettingsSectionNotFound,
  WorkspaceSettingsLayout,
};


