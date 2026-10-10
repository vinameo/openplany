import type { ReactNode } from "react";
import classes from "./WorkspaceFrame.module.css";

interface WorkspaceFrameProps {
  children: ReactNode;
}

/**
 * Floating card frame wrapping workspace content.
 * Border and margins appear on desktop (>=48em), while mobile has no margins/borders.
 */
export function WorkspaceFrame({ children }: WorkspaceFrameProps) {
  return (
    <div className={classes.frame}>
      <div className={classes.panel}>{children}</div>
    </div>
  );
}
