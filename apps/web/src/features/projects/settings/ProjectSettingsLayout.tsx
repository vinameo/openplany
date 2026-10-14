import { Outlet, useParams } from "react-router";
import { Skeleton, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { buildSettingsNavigation } from "../../settings/settingsNavigation";
import { SettingsLayoutFrame } from "../../settings/SettingsLayoutFrame";
import { SettingsMobileNavFrame } from "../../settings/SettingsMobileNavFrame";
import { SettingsSidebarFrame } from "../../settings/SettingsSidebarFrame";
import { useSettingsSectionKey } from "../../settings/settingsSectionHandle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useCurrentProject } from "../detail/currentProjectContext";
import { ProjectLoadError } from "../detail/ProjectLoadError";
import { projectPath, projectSettingsPath } from "../projectPaths";
import { ProjectSettingsCard } from "./ProjectSettingsCard";
import {
  PROJECT_SETTINGS_GROUPS,
  PROJECT_SETTINGS_SECTIONS,
} from "./projectSettingsSections";

function ProjectSettingsLoadingSkeleton() {
  return (
    <Stack gap="md" maw={880} aria-busy="true" role="status">
      <Skeleton height={180} radius="md" />
      <Skeleton height={42} radius="sm" mt="md" />
      <Skeleton height={80} radius="sm" />
      <Skeleton height={42} radius="sm" />
    </Stack>
  );
}

export function ProjectSettingsLayout() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { projectIdentifier = "" } = useParams();
  const { project, status, retry } = useCurrentProject();
  const activeKey = useSettingsSectionKey();

  const permissions = project === null ? null : project.permissions;
  const nav = buildSettingsNavigation({
    sections: PROJECT_SETTINGS_SECTIONS,
    groups: PROJECT_SETTINGS_GROUPS,
    permissions,
    activeKey,
  });

  const sidebar = (
    <SettingsSidebarFrame
      navLabel={t("project:settings.navLabel")}
      heading={t("project:settings.heading")}
      backTo={projectPath(workspace.slug, projectIdentifier)}
      backLabel={t("project:settings.backLabel")}
      card={<ProjectSettingsCard />}
      groups={nav.groups}
      activeKey={nav.activeKey}
      pathFor={(key) =>
        projectSettingsPath(workspace.slug, projectIdentifier, key)
      }
    />
  );

  const mobileNav = (
    <SettingsMobileNavFrame
      heading={t("project:settings.heading")}
      backTo={projectPath(workspace.slug, projectIdentifier)}
      backLabel={t("project:settings.backLabel")}
      groups={nav.groups}
      activeKey={nav.activeKey}
      pathFor={(key) =>
        projectSettingsPath(workspace.slug, projectIdentifier, key)
      }
    />
  );

  return (
    <SettingsLayoutFrame sidebar={sidebar} mobileNav={mobileNav}>
      {status === "error" ? (
        <ProjectLoadError onRetry={retry} />
      ) : status === "loading" ? (
        <ProjectSettingsLoadingSkeleton />
      ) : (
        <Outlet />
      )}
    </SettingsLayoutFrame>
  );
}
