import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentProject } from "../detail/currentProjectContext";

function ProjectSettingsTitleContent({
  projectName,
  title,
}: {
  projectName: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const fullTitle =
    title !== undefined && title !== ""
      ? t("project:settings.documentTitleWithSection", {
          section: title,
          project: projectName,
        })
      : t("project:settings.documentTitle", { project: projectName });
  useDocumentTitle(fullTitle);
  return null;
}

export function ProjectSettingsTitle({ title }: { title?: string }) {
  const { project } = useCurrentProject();
  if (project === null) {
    return null;
  }
  return (
    <ProjectSettingsTitleContent projectName={project.name} title={title} />
  );
}
