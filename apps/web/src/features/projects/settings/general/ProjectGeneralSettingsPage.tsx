import { useCurrentProject } from "../../detail/currentProjectContext";
import { ProjectGeneralSettingsForm } from "./ProjectGeneralSettingsForm";

export function ProjectGeneralSettingsPage() {
  const { project } = useCurrentProject();

  if (!project) {
    return null;
  }

  return <ProjectGeneralSettingsForm project={project} />;
}
