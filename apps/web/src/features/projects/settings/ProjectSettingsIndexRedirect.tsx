import { Center, Loader, Text } from "@mantine/core";
import { Navigate } from "react-router";
import { firstOpenableSection } from "../../settings/settingsNavigation";
import { useCurrentProject } from "../detail/currentProjectContext";
import { PROJECT_SETTINGS_MESSAGES } from "./projectSettingsMessages";
import { PROJECT_SETTINGS_SECTIONS } from "./projectSettingsSections";
import { ProjectSettingsTitle } from "./ProjectSettingsTitle";

export function ProjectSettingsIndexRedirect() {
  const { project, status } = useCurrentProject();

  if (status === "loading" || project === null) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  const target = firstOpenableSection(
    PROJECT_SETTINGS_SECTIONS,
    project.permissions,
  );

  if (!target) {
    return (
      <>
        <ProjectSettingsTitle />
        <Center p="xl">
          <Text c="dimmed">{PROJECT_SETTINGS_MESSAGES.noAccess}</Text>
        </Center>
      </>
    );
  }

  return <Navigate replace to={target.key} />;
}
