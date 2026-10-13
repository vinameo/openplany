import type { ReactNode } from "react";
import { SettingsSectionFrame } from "../../settings/SettingsSectionFrame";
import { useSettingsSectionKey } from "../../settings/settingsSectionHandle";
import { useCurrentProject } from "../detail/currentProjectContext";
import {
  PROJECT_SETTINGS_SECTIONS,
  type ProjectSettingsSection,
} from "./projectSettingsSections";
import { ProjectSettingsTitle } from "./ProjectSettingsTitle";

interface ProjectSettingsSectionRouteProps {
  children: ReactNode;
  sections?: readonly ProjectSettingsSection[];
}

export function ProjectSettingsSectionRoute({
  children,
  sections = PROJECT_SETTINGS_SECTIONS,
}: ProjectSettingsSectionRouteProps) {
  const { project } = useCurrentProject();
  const sectionKey = useSettingsSectionKey();

  if (!sectionKey) {
    throw new Error(
      "ProjectSettingsSectionRoute used without settingsSection handle",
    );
  }

  const section = sections.find((s) => s.key === sectionKey);
  if (!section) {
    throw new Error(`Unknown project settings section key "${sectionKey}"`);
  }

  const hasPermission =
    project === null ||
    !section.viewPermission ||
    project.permissions.includes(section.viewPermission);

  return (
    <>
      <ProjectSettingsTitle title={section.label} />
      <SettingsSectionFrame
        icon={section.icon}
        label={section.label}
        allowed={hasPermission}
      >
        {children}
      </SettingsSectionFrame>
    </>
  );
}
