import { Outlet } from "react-router";
import { SettingsMobileNav } from "./sidebar/SettingsMobileNav";
import { SettingsSidebar } from "./sidebar/SettingsSidebar";
import classes from "./WorkspaceSettingsLayout.module.css";

export function WorkspaceSettingsLayout() {
  return (
    <div className={classes.layout}>
      <SettingsSidebar />
      <main className={classes.main}>
        <SettingsMobileNav />
        <Outlet />
      </main>
    </div>
  );
}

