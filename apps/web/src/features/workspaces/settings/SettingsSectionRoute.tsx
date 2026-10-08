import { type ReactNode } from "react";
import { Alert, Text } from "@mantine/core";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../currentWorkspace/useCurrentWorkspace";
import {
  WORKSPACE_SETTINGS_SECTIONS,
  type WorkspaceSettingsSection,
} from "./settingsSections";
import classes from "./SettingsSectionRoute.module.css";

interface SettingsSectionRouteProps {
  sectionKey: string;
  children: ReactNode;
  sections?: readonly WorkspaceSettingsSection[];
}

export function SettingsSectionRoute({
  sectionKey,
  children,
  sections = WORKSPACE_SETTINGS_SECTIONS,
}: SettingsSectionRouteProps) {
  const { workspace } = useCurrentWorkspace();

  const section = sections.find((s) => s.key === sectionKey);
  if (!section) {
    throw new Error(`Unknown settings section key "${sectionKey}"`);
  }

  useDocumentTitle(`${section.label} · ${workspace.name} settings`);

  const hasPermission =
    !section.viewPermission ||
    workspace.permissions.includes(section.viewPermission);

  const Icon = section.icon;

  return (
    <>
      <div className={classes.sectionHeader}>
        <Icon width={16} height={16} />
        <Text className={classes.sectionTitle}>{section.label}</Text>
      </div>
      <div className={classes.sectionBody}>
        {hasPermission ? (
          children
        ) : (
          <Alert color="red" title="Access Denied" role="alert">
            You don't have access to this page.
          </Alert>
        )}
      </div>
    </>
  );
}

