import { Outlet } from "react-router";
import { SettingsLayoutFrame } from "../../settings/SettingsLayoutFrame";
import { SettingsMobileNav } from "./sidebar/SettingsMobileNav";
import { SettingsSidebar } from "./sidebar/SettingsSidebar";

export function WorkspaceSettingsLayout() {
  return (
    <SettingsLayoutFrame
      sidebar={<SettingsSidebar />}
      mobileNav={<SettingsMobileNav />}
    >
      <Outlet />
    </SettingsLayoutFrame>
  );
}
