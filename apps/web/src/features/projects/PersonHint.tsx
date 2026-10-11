import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Popover, Tooltip } from "@mantine/core";
import { useIsDesktop } from "../layout/useIsDesktop";
import classes from "./PersonHint.module.css";

export interface PersonHintTrigger {
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface PersonHintProps {
  content: ReactNode;
  children: (trigger: PersonHintTrigger) => ReactElement;
}

export function PersonHint({ content, children }: PersonHintProps) {
  const isDesktop = useIsDesktop();
  const [opened, setOpened] = useState(false);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isDesktop) {
        event.preventDefault();
        setOpened((prev) => !prev);
      }
    },
    [isDesktop],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!isDesktop && event.key === "Escape") {
        setOpened(false);
      }
    },
    [isDesktop],
  );

  useEffect(() => {
    if (!isDesktop && opened) {
      const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") {
          setOpened(false);
        }
      };
      document.addEventListener("keydown", onDocKeyDown);
      return () => document.removeEventListener("keydown", onDocKeyDown);
    }
  }, [isDesktop, opened]);

  const trigger: PersonHintTrigger = {
    onClick: handleClick,
    onKeyDown: handleKeyDown,
  };

  const child = children(trigger);

  if (isDesktop) {
    return (
      <Tooltip
        label={content}
        withArrow
        multiline
        openDelay={300}
        events={{ hover: true, focus: true, touch: false }}
      >
        {child}
      </Tooltip>
    );
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom"
      withArrow
      closeOnClickOutside
      closeOnEscape
      withinPortal={false}
      classNames={{ dropdown: classes.dropdown }}
    >
      <Popover.Target>{child}</Popover.Target>
      <Popover.Dropdown>{content}</Popover.Dropdown>
    </Popover>
  );
}
