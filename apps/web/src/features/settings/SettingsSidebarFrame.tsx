import type { ReactNode } from "react";
import { ActionIcon, Box, ScrollArea, Text } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon } from "../workspaces/icons";
import { SidebarNavItem } from "../workspaces/shell/SidebarNavItem";
import classes from "./SettingsSidebar.module.css";
import type { SettingsNavigationGroup } from "./settingsNavigation";

export interface SettingsSidebarFrameProps {
  navLabel: string;
  heading: string;
  backTo: string;
  backLabel: string;
  card: ReactNode;
  groups: readonly SettingsNavigationGroup[];
  activeKey: string | null;
  pathFor: (key: string) => string;
}

export function SettingsSidebarFrame({
  navLabel,
  heading,
  backTo,
  backLabel,
  card,
  groups,
  activeKey,
  pathFor,
}: SettingsSidebarFrameProps) {
  const { t } = useTranslation();

  return (
    <Box
      component="nav"
      aria-label={navLabel}
      className={classes.nav}
      visibleFrom="sm"
    >
      <div className={classes.headerRow}>
        <ActionIcon
          component={Link}
          to={backTo}
          variant="subtle"
          color="gray"
          size="md"
          aria-label={backLabel}
        >
          <ArrowLeftIcon width={18} height={18} />
        </ActionIcon>
        <Text component="h1" className={classes.heading}>
          {heading}
        </Text>
      </div>

      {card}

      <ScrollArea type="hover" scrollbarSize={6} className={classes.scrollArea}>
        <div className={classes.scrollContent}>
          <div className={classes.groupsWrapper}>
            {groups.map((group, groupIndex) => {
              const headingId = `settings-group-${group.key}`;
              const groupLabel = group.labelKey
                ? t(group.labelKey)
                : (group.label ?? group.key);

              return (
                <div
                  key={group.key}
                  className={
                    groupIndex > 0 ? classes.groupWithMargin : classes.group
                  }
                >
                  <Text
                    component="h2"
                    id={headingId}
                    fz="sm"
                    c="dimmed"
                    className={classes.groupLabel}
                  >
                    {groupLabel}
                  </Text>
                  <ul
                    role="list"
                    aria-labelledby={headingId}
                    className={classes.sectionList}
                  >
                    {group.sections.map((section) => {
                      const Icon = section.icon;
                      const isComingSoon = section.comingSoon === true;
                      const sectionLabel = section.labelKey
                        ? t(section.labelKey)
                        : (section.label ?? section.key);

                      return (
                        <li key={section.key}>
                          <SidebarNavItem
                            label={sectionLabel}
                            icon={<Icon width={16} height={16} />}
                            to={isComingSoon ? undefined : pathFor(section.key)}
                            active={section.key === activeKey}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </Box>
  );
}
