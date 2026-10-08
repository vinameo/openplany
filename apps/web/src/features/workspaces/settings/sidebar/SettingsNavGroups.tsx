import { Text } from "@mantine/core";
import { SettingsNavItem } from "./SettingsNavItem";
import classes from "./SettingsSidebar.module.css";
import type { SettingsNavigationGroup } from "./useSettingsNavigation";

interface SettingsNavGroupsProps {
  groups: SettingsNavigationGroup[];
  activeKey: string | null;
}

export function SettingsNavGroups({
  groups,
  activeKey,
}: SettingsNavGroupsProps) {
  return (
    <div className={classes.groupsWrapper}>
      {groups.map((group, groupIndex) => {
        const headingId = `settings-group-${group.key}`;

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
              {group.label}
            </Text>
            <ul
              role="list"
              aria-labelledby={headingId}
              className={classes.sectionList}
            >
              {group.sections.map((section) => (
                <SettingsNavItem
                  key={section.key}
                  section={section}
                  isActive={section.key === activeKey}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

