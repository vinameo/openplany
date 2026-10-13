import { ProjectGeneralSettingsPage } from "./general/ProjectGeneralSettingsPage";
import { ProjectSettingsIndexRedirect } from "./ProjectSettingsIndexRedirect";
import { ProjectSettingsLayout } from "./ProjectSettingsLayout";
import { ProjectSettingsSectionNotFound } from "./ProjectSettingsSectionNotFound";
import { ProjectSettingsSectionRoute } from "./ProjectSettingsSectionRoute";

export function ProjectGeneralSettingsRoute() {
  return (
    <ProjectSettingsSectionRoute>
      <ProjectGeneralSettingsPage />
    </ProjectSettingsSectionRoute>
  );
}

export {
  ProjectSettingsIndexRedirect,
  ProjectSettingsLayout,
  ProjectSettingsSectionNotFound,
};
