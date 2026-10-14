import { ActionIcon, Box, Select, Text } from "@mantine/core";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon } from "../workspaces/icons";
import classes from "./SettingsSidebar.module.css";
import type { SettingsNavigationGroup } from "./settingsNavigation";

export interface SettingsMobileNavFrameProps {
  heading: string;
  backTo: string;
  backLabel: string;
  groups: readonly SettingsNavigationGroup[];
  activeKey: string | null;
  pathFor: (key: string) => string;
}

export function SettingsMobileNavFrame({
  heading,
  backTo,
  backLabel,
  groups,
  activeKey,
  pathFor,
}: SettingsMobileNavFrameProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const selectData = groups.map((group) => {
    const groupLabel = group.labelKey
      ? t(group.labelKey)
      : (group.label ?? group.key);

    return {
      group: groupLabel,
      items: group.sections.map((section) => {
        const sectionLabel = section.labelKey
          ? t(section.labelKey)
          : (section.label ?? section.key);

        return {
          value: section.key,
          label: section.comingSoon
            ? `${sectionLabel} (${t("common:comingSoon")})`
            : sectionLabel,
          disabled: section.comingSoon === true,
        };
      }),
    };
  });

  return (
    <Box className={classes.mobileNav} hiddenFrom="sm">
      <div className={classes.mobileHeader}>
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

      <Select
        aria-label={t("settings:nav.sectionAriaLabel")}
        data={selectData}
        value={activeKey}
        placeholder={t("settings:nav.chooseSectionPlaceholder")}
        allowDeselect={false}
        searchable={false}
        checkIconPosition="right"
        onChange={(val) => {
          if (val) {
            navigate(pathFor(val));
          }
        }}
      />
    </Box>
  );
}
