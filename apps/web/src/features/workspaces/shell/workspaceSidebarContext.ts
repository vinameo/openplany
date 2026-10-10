import { createContext, type RefObject } from "react";

export type WorkspaceSidebarMode = "desktop" | "mobile";

export interface WorkspaceSidebarValue {
  mode: WorkspaceSidebarMode;
  /** Desktop: !collapsed. Mobile: drawer open on the current path. */
  isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** id of the sidebar `nav` (desktop) or drawer content (mobile), for aria-controls. */
  sidebarId: string;
  collapseButtonRef: RefObject<HTMLButtonElement | null>;
  expandButtonRef: RefObject<HTMLButtonElement | null>;
}

export const WorkspaceSidebarContext =
  createContext<WorkspaceSidebarValue | null>(null);
