import { createContext } from "react";
import type { WorkspaceResponse } from "@repo/contracts";

export interface CurrentWorkspaceValue {
  /** The workspace currently open inside the WorkspaceLayout. */
  workspace: WorkspaceResponse;
  /** The single way to change the open workspace on the client (RQ 5.8). */
  applyWorkspaceUpdate: (workspace: WorkspaceResponse) => void;
  /** Re-read GET /:slug, e.g. after a 403 to pick up new permissions. */
  reload: () => Promise<void>;
}

export const CurrentWorkspaceContext =
  createContext<CurrentWorkspaceValue | null>(null);

