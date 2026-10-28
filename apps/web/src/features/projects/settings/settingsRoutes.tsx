import { ProjectGeneralSettingsPage } from "./general/ProjectGeneralSettingsPage";
import { ProjectMembersSettingsPage } from "./members/ProjectMembersSettingsPage";
import { ProjectStatesPage } from "./states/ProjectStatesPage";
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

export function ProjectMembersSettingsRoute() {
  return (
    <ProjectSettingsSectionRoute>
      <ProjectMembersSettingsPage />
    </ProjectSettingsSectionRoute>
  );
}

export function ProjectStatesSettingsRoute() {
  return <ProjectStatesPage />;
}

export {
  ProjectSettingsIndexRedirect,
  ProjectSettingsLayout,
  ProjectSettingsSectionNotFound,
  ProjectStatesPage,
};
