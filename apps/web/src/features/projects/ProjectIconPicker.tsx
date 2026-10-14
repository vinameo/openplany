import {
  cloneElement,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  ColorSwatch,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  PROJECT_ICON_COLOR_PATTERN,
  PROJECT_ICON_NAMES,
  type MessageKey,
  type ProjectIconName,
} from "@repo/contracts";
import { SearchIcon } from "../workspaces/icons";
import { adjustIconColorForContrast } from "./iconColor";
import { PROJECT_ICON_COMPONENTS } from "./projectIcons";
import { useGridNavigation } from "./useGridNavigation";
import classes from "./ProjectIconPicker.module.css";

const COLOR_PRESETS: readonly { color: string; labelKey: MessageKey }[] = [
  { color: "#868E96", labelKey: "project:icons.colors.gray" },
  { color: "#5C6B7A", labelKey: "project:icons.colors.slate" },
  { color: "#5C5FD6", labelKey: "project:icons.colors.indigo" },
  { color: "#15AABF", labelKey: "project:icons.colors.cyan" },
  { color: "#2F9E44", labelKey: "project:icons.colors.green" },
  { color: "#FAB005", labelKey: "project:icons.colors.yellow" },
  { color: "#F76707", labelKey: "project:icons.colors.orange" },
  { color: "#FF8787", labelKey: "project:icons.colors.pink" },
] as const;

export interface ProjectIconPickerProps {
  value: { name: ProjectIconName; color: string };
  onChange: (value: { name: ProjectIconName; color: string }) => void;
  children:
    | ReactElement<{ onClick?: () => void }>
    | ((props: { opened: boolean; onClick: () => void }) => ReactElement);
}

export function ProjectIconPicker({
  value,
  onChange,
  children,
}: ProjectIconPickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customHex, setCustomHex] = useState(value.color);

  const scheme = useComputedColorScheme("light");
  const theme = useMantineTheme();
  const bg =
    scheme === "dark" ? (theme.colors.dark?.[7] ?? "#0F172A") : "#FFFFFF";

  const effectiveIconColor = useMemo(
    () => adjustIconColorForContrast(value.color, bg),
    [value.color, bg],
  );

  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/[-_\s]/g, "");
    if (!q) return PROJECT_ICON_NAMES;
    return PROJECT_ICON_NAMES.filter((name) =>
      name.replace(/[-_\s]/g, "").includes(q),
    );
  }, [search]);

  const selectedIndex = filteredIcons.indexOf(value.name as ProjectIconName);

  const { registerItem, handleKeyDown, getTabIndex } = useGridNavigation({
    totalItems: filteredIcons.length,
    columns: 8,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
    onSelect: (index) => {
      const icon = filteredIcons[index];
      if (icon) {
        onChange({ ...value, name: icon });
      }
    },
  });

  const handleCustomHexChange = (inputVal: string) => {
    setCustomHex(inputVal);
    if (PROJECT_ICON_COLOR_PATTERN.test(inputVal)) {
      onChange({ ...value, color: inputVal.toUpperCase() });
    }
  };

  const handlePopoverKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpened(false);
    }
  };

  const triggerProps = {
    opened,
    onClick: () => setOpened((prev) => !prev),
  };

  const targetEl =
    typeof children === "function"
      ? children(triggerProps)
      : cloneElement(children, {
          onClick: () => setOpened((prev) => !prev),
        });

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      trapFocus
      returnFocus
      closeOnEscape
      withinPortal
      classNames={{ dropdown: classes.dropdown }}
    >
      <Popover.Target>{targetEl}</Popover.Target>

      <Popover.Dropdown onKeyDown={handlePopoverKeyDown}>
        <Stack gap="xs">
          {/* 1. Search icons */}
          <TextInput
            placeholder={t("project:icons.searchPlaceholder")}
            aria-label={t("project:icons.searchAriaLabel")}
            size="xs"
            leftSection={<SearchIcon width={14} height={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />

          {/* 2. Color swatches */}
          <div
            role="radiogroup"
            aria-label={t("project:icons.colorGroupAriaLabel")}
            className={classes.colorRow}
          >
            {COLOR_PRESETS.map((preset) => {
              const isSelected =
                value.color.toUpperCase() === preset.color.toUpperCase();
              return (
                <button
                  type="button"
                  key={preset.color}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={t(preset.labelKey)}
                  className={`${classes.swatchButton} ${isSelected ? classes.swatchSelected : ""}`}
                  onClick={() => onChange({ ...value, color: preset.color })}
                >
                  <ColorSwatch color={preset.color} size={22} />
                </button>
              );
            })}
            <button
              type="button"
              aria-label={t("project:icons.customColorPickerAriaLabel")}
              className={classes.hashButton}
              onClick={() => setShowCustomInput((prev) => !prev)}
            >
              #
            </button>
          </div>

          {/* 3. Custom color input */}
          {showCustomInput && (
            <TextInput
              placeholder={t("project:icons.hexPlaceholder")}
              aria-label={t("project:icons.customColorAriaLabel")}
              size="xs"
              value={customHex}
              onChange={(e) => handleCustomHexChange(e.currentTarget.value)}
            />
          )}

          {/* 4. Contrast disclaimer note */}
          <div className={classes.noteRow}>
            <Text size="xs" c="dimmed">
              {t("project:icons.contrastDisclaimer")}
            </Text>
          </div>

          {/* 5. Icon grid */}
          <ScrollArea h={240} type="auto">
            <div
              role="radiogroup"
              aria-label={t("project:icons.iconGroupAriaLabel")}
              className={classes.iconGrid}
            >
              {filteredIcons.map((iconName, index) => {
                const IconComponent = PROJECT_ICON_COMPONENTS[iconName];
                const isSelected = value.name === iconName;
                const tabIndex = getTabIndex(index);

                return (
                  <ActionIcon
                    key={iconName}
                    ref={registerItem(index)}
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={iconName.replace(/-/g, " ")}
                    tabIndex={tabIndex}
                    variant={isSelected ? "light" : "subtle"}
                    color="gray"
                    className={`${classes.iconCell} ${isSelected ? classes.iconCellSelected : ""}`}
                    onClick={() => onChange({ ...value, name: iconName })}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                  >
                    <IconComponent size={20} color={effectiveIconColor} />
                  </ActionIcon>
                );
              })}
            </div>
          </ScrollArea>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
