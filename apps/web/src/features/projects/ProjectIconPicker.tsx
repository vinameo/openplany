import {
  cloneElement,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
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
  type ProjectIconName,
} from "@repo/contracts";
import { SearchIcon } from "../workspaces/icons";
import { adjustIconColorForContrast } from "./iconColor";
import { PROJECT_ICON_COMPONENTS } from "./projectIcons";
import { useGridNavigation } from "./useGridNavigation";
import classes from "./ProjectIconPicker.module.css";

const COLOR_PRESETS = [
  { color: "#868E96", label: "Gray" },
  { color: "#5C6B7A", label: "Slate" },
  { color: "#5C5FD6", label: "Indigo" },
  { color: "#15AABF", label: "Cyan" },
  { color: "#2F9E44", label: "Green" },
  { color: "#FAB005", label: "Yellow" },
  { color: "#F76707", label: "Orange" },
  { color: "#FF8787", label: "Pink" },
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
            placeholder="Search icons…"
            aria-label="Search icons"
            size="xs"
            leftSection={<SearchIcon width={14} height={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />

          {/* 2. Color swatches */}
          <div role="radiogroup" aria-label="Icon color" className={classes.colorRow}>
            {COLOR_PRESETS.map((preset) => {
              const isSelected =
                value.color.toUpperCase() === preset.color.toUpperCase();
              return (
                <button
                  type="button"
                  key={preset.color}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={preset.label}
                  className={`${classes.swatchButton} ${isSelected ? classes.swatchSelected : ""}`}
                  onClick={() => onChange({ ...value, color: preset.color })}
                >
                  <ColorSwatch color={preset.color} size={22} />
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Custom color picker"
              className={classes.hashButton}
              onClick={() => setShowCustomInput((prev) => !prev)}
            >
              #
            </button>
          </div>

          {/* 3. Custom color input */}
          {showCustomInput && (
            <TextInput
              placeholder="#RRGGBB"
              aria-label="Custom color"
              size="xs"
              value={customHex}
              onChange={(e) => handleCustomHexChange(e.currentTarget.value)}
            />
          )}

          {/* 4. Contrast disclaimer note */}
          <div className={classes.noteRow}>
            <Text size="xs" c="dimmed">
              ⓘ Colors will be adjusted to ensure sufficient contrast.
            </Text>
          </div>

          {/* 5. Icon grid */}
          <ScrollArea h={240} type="auto">
            <div role="radiogroup" aria-label="Icon" className={classes.iconGrid}>
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
