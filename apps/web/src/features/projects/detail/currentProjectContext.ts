import { createContext, useContext } from "react";
import type { ProjectListItem } from "@repo/contracts";

export interface CurrentProjectValue {
  /** null when loading or error. */
  project: ProjectListItem | null;
  status: "loading" | "ready" | "error";
  retry: () => void;
}

export const CurrentProjectContext =
  createContext<CurrentProjectValue | null>(null);

export function useCurrentProject(): CurrentProjectValue {
  const value = useContext(CurrentProjectContext);
  if (!value) {
    throw new Error(
      "useCurrentProject must be used within CurrentProjectContext",
    );
  }
  return value;
}
