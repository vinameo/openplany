import { createContext, useContext } from "react";
import type { ProjectListItem } from "@repo/contracts";

export interface CreateWorkItemContextValue {
  openCreateWorkItem: (project: ProjectListItem) => void;
}

export const CreateWorkItemContext =
  createContext<CreateWorkItemContextValue | null>(null);

export function useCreateWorkItemModal(): CreateWorkItemContextValue {
  const ctx = useContext(CreateWorkItemContext);
  if (!ctx) {
    throw new Error(
      "useCreateWorkItemModal must be used within a CreateWorkItemProvider",
    );
  }
  return ctx;
}
