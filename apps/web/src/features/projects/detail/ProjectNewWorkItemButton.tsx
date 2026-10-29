import { useTranslation } from "react-i18next";
import { NewWorkItemButton } from "../../workspaces/shell/NewWorkItemButton";
import { useCreateWorkItemModal } from "../../workItems/create/createWorkItemContext";
import { useCurrentProject } from "./currentProjectContext";

/**
 * Project sidebar wrapper for NewWorkItemButton:
 * - Disabled without tooltip when project is loading/null
 * - Enabled with openCreateWorkItem when actor has 'project.workitems.create'
 * - Disabled with 'workItem:create.noPermission' tooltip when actor lacks permission
 */
export function ProjectNewWorkItemButton() {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { openCreateWorkItem } = useCreateWorkItemModal();

  if (project === null) {
    return <NewWorkItemButton disabledHint="" />;
  }

  const hasPermission = project.permissions.includes(
    "project.workitems.create",
  );
  if (!hasPermission) {
    return (
      <NewWorkItemButton disabledHint={t("workItem:create.noPermission")} />
    );
  }

  return <NewWorkItemButton onClick={() => openCreateWorkItem(project)} />;
}
