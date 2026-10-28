import { useState, type ReactNode } from "react";
import type { ProjectListItem } from "@repo/contracts";
import { CreateWorkItemContext } from "./createWorkItemContext";
import { CreateWorkItemModal } from "./CreateWorkItemModal";

export interface CreateWorkItemProviderProps {
  slug: string;
  reloadProject?: () => void;
  children: ReactNode;
}

export function CreateWorkItemProvider({
  slug,
  reloadProject,
  children,
}: CreateWorkItemProviderProps) {
  const [opened, setOpened] = useState(false);
  const [targetProject, setTargetProject] = useState<ProjectListItem | null>(
    null,
  );
  const [modalKey, setModalKey] = useState(0);

  const openCreateWorkItem = (project: ProjectListItem) => {
    setTargetProject(project);
    setModalKey((k) => k + 1);
    setOpened(true);
  };

  const closeCreateWorkItem = () => {
    setOpened(false);
  };

  return (
    <CreateWorkItemContext.Provider value={{ openCreateWorkItem }}>
      {children}
      {targetProject && (
        <CreateWorkItemModal
          key={modalKey}
          opened={opened}
          onClose={closeCreateWorkItem}
          slug={slug}
          project={targetProject}
          reloadProject={reloadProject}
        />
      )}
    </CreateWorkItemContext.Provider>
  );
}
