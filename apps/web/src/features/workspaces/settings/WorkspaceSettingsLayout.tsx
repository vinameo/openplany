import { useRef } from "react";
import { Outlet } from "react-router";
import { useScrollTopOnNavigate } from "../shell/useScrollTopOnNavigate";
import { SettingsMobileNav } from "./sidebar/SettingsMobileNav";
import { SettingsSidebar } from "./sidebar/SettingsSidebar";
import classes from "./WorkspaceSettingsLayout.module.css";

export function WorkspaceSettingsLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useScrollTopOnNavigate(mainRef);

  return (
    <div className={classes.layout}>
      <SettingsSidebar />
      <main ref={mainRef} className={classes.main}>
        <SettingsMobileNav />
        <Outlet />
      </main>
    </div>
  );
}

