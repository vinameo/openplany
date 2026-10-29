import {
  cloneElement,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { Popover } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PROJECT_COVER_KEYS, type ProjectCoverKey } from "@repo/contracts";
import { IconCheck } from "@tabler/icons-react";
import { useIsDesktop } from "../layout/useIsDesktop";
import { PROJECT_COVERS } from "./projectCovers";
import { useGridNavigation } from "./useGridNavigation";
import classes from "./ProjectCoverPicker.module.css";

export interface ProjectCoverPickerProps {
  value: ProjectCoverKey;
  onChange: (key: ProjectCoverKey) => void;
  children:
    | ReactElement<{ onClick?: () => void }>
    | ((props: { opened: boolean; onClick: () => void }) => ReactElement);
}

export function ProjectCoverPicker({
  value,
  onChange,
  children,
}: ProjectCoverPickerProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const isDesktop = useIsDesktop();
  const columns = isDesktop ? 4 : 2;

  const selectedIndex = PROJECT_COVER_KEYS.indexOf(value);

  const { registerItem, handleKeyDown, getTabIndex } = useGridNavigation({
    totalItems: PROJECT_COVER_KEYS.length,
    columns,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
    onSelect: (index) => {
      const key = PROJECT_COVER_KEYS[index];
      if (key) {
        onChange(key);
        setOpened(false);
      }
    },
  });

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
      position="bottom-end"
      trapFocus
      returnFocus
      closeOnEscape
      withinPortal
    >
      <Popover.Target>{targetEl}</Popover.Target>
      <Popover.Dropdown
        className={classes.dropdown}
        onKeyDown={handlePopoverKeyDown}
      >
        <div
          role="radiogroup"
          aria-label={t("project:covers.ariaLabel")}
          className={classes.grid}
        >
          {PROJECT_COVER_KEYS.map((key, index) => {
            const isSelected = key === value;
            const cover = PROJECT_COVERS[key];

            return (
              <button
                key={key}
                ref={registerItem(index)}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={cover.label}
                tabIndex={getTabIndex(index)}
                className={`${classes.coverButton} ${isSelected ? classes.selected : ""}`}
                onClick={() => {
                  onChange(key);
                  setOpened(false);
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                <img
                  src={cover.thumb}
                  alt=""
                  loading="lazy"
                  className={classes.thumbImg}
                />
                {isSelected ? (
                  <div className={classes.checkBadge} aria-hidden="true">
                    <IconCheck size={12} stroke={3} />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
