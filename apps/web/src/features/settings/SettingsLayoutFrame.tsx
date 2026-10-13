import { useRef, type ReactNode } from "react";
import { useScrollTopOnNavigate } from "../workspaces/shell/useScrollTopOnNavigate";
import classes from "./SettingsLayoutFrame.module.css";

export interface SettingsLayoutFrameProps {
  sidebar: ReactNode;
  mobileNav: ReactNode;
  children: ReactNode;
}

export function SettingsLayoutFrame({
  sidebar,
  mobileNav,
  children,
}: SettingsLayoutFrameProps) {
  const mainRef = useRef<HTMLElement>(null);
  useScrollTopOnNavigate(mainRef);

  return (
    <div className={classes.layout}>
      {sidebar}
      <main ref={mainRef} className={classes.main}>
        {mobileNav}
        {children}
      </main>
    </div>
  );
}
