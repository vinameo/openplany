import { GeneralSettingsPage } from "./general/GeneralSettingsPage";
import { SettingsIndexRedirect } from "./SettingsIndexRedirect";
import { SettingsSectionNotFound } from "./SettingsSectionNotFound";
import { SettingsSectionRoute } from "./SettingsSectionRoute";
import { WorkspaceSettingsLayout } from "./WorkspaceSettingsLayout";

import { MembersSettingsPage } from "./members/MembersSettingsPage";
import { WorkspaceStatesPage } from "./states/WorkspaceStatesPage";

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

export function WorkspaceStatesSettingsRoute() {
  return <WorkspaceStatesPage />;
}

export {
  SettingsIndexRedirect,
  SettingsSectionNotFound,
  WorkspaceSettingsLayout,
  WorkspaceStatesPage,
};
