import { Skeleton, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PROJECT_ROLE_LABELS } from "@repo/contracts";
import classes from "../../workspaces/settings/sidebar/SettingsSidebar.module.css";
import { useCurrentProject } from "../detail/currentProjectContext";
import { ProjectIcon } from "../ProjectIcon";

export function ProjectSettingsCard() {
  const { t } = useTranslation();
  const { project, status } = useCurrentProject();

  if (status === "loading" || project === null) {
    return (
      <div
        role="status"
        aria-label={t("project:settings.loadingProject")}
        className={classes.workspaceCard}
      >
        <Skeleton width={30} height={30} radius="sm" />
        <div className={classes.workspaceInfo}>
          <Skeleton width={120} height={16} mb={4} />
          <Skeleton width={80} height={12} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.workspaceCard}>
      <ProjectIcon icon={project.icon} size={30} />
      <div className={classes.workspaceInfo}>
        <Text className={classes.workspaceName} title={project.name}>
          {project.name}
        </Text>
        <Text className={classes.workspaceRole}>
          {PROJECT_ROLE_LABELS[project.role]}
        </Text>
      </div>
    </div>
  );
}
