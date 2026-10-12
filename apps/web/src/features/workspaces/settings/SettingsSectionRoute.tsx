import { type ReactNode } from "react";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import { SettingsSectionFrame } from "../../settings/SettingsSectionFrame";
import { useSettingsSectionKey } from "../../settings/settingsSectionHandle";
import {
  WORKSPACE_SETTINGS_SECTIONS,
  type WorkspaceSettingsSection,
} from "./settingsSections";

interface SettingsSectionRouteProps {
  sectionKey?: string;
  children: ReactNode;
  sections?: readonly WorkspaceSettingsSection[];
}

export function SettingsSectionRoute({
  sectionKey: propSectionKey,
  children,
  sections = WORKSPACE_SETTINGS_SECTIONS,
}: SettingsSectionRouteProps) {
  const { workspace } = useCurrentWorkspace();
  const handleKey = useSettingsSectionKey();
  const sectionKey = propSectionKey ?? handleKey;

  const section = sections.find((s) => s.key === sectionKey);
  if (!section) {
    throw new Error(`Unknown settings section key "${sectionKey ?? "undefined"}"`);
  }

  useDocumentTitle(`${section.label} · ${workspace.name} settings`);

  const hasPermission =
    !section.viewPermission ||
    workspace.permissions.includes(section.viewPermission);

  return (
    <SettingsSectionFrame
      icon={section.icon}
      label={section.label}
      allowed={hasPermission}
    >
      {children}
    </SettingsSectionFrame>
  );
}
