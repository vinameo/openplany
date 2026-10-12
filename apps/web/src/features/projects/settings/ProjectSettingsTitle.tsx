import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentProject } from "../detail/currentProjectContext";

function ProjectSettingsTitleContent({
  projectName,
  title,
}: {
  projectName: string;
  title?: string;
}) {
  const fullTitle =
    title !== undefined && title !== ""
      ? `${title} · ${projectName} settings`
      : `${projectName} settings`;
  useDocumentTitle(fullTitle);
  return null;
}

export function ProjectSettingsTitle({ title }: { title?: string }) {
  const { project } = useCurrentProject();
  if (project === null) {
    return null;
  }
  return (
    <ProjectSettingsTitleContent
      projectName={project.name}
      title={title}
    />
  );
}
