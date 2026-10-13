import { useRouteHandleMeta } from "../../hooks/useRouteHandleMeta";

export interface SettingsSectionHandle {
  settingsSection: string;
}

function isSettingsSectionValue(value: unknown): value is string {
  return typeof value === "string";
}

export function useSettingsSectionKey(): string | null {
  return useRouteHandleMeta("settingsSection", isSettingsSectionValue);
}
