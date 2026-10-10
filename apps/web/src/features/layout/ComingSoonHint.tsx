import { useCallback, useState, type MouseEvent, type ReactElement } from "react";
import { Popover, Text, Tooltip } from "@mantine/core";
import { useTimeout } from "@mantine/hooks";
import { useIsDesktop } from "./useIsDesktop";
import classes from "./ComingSoonHint.module.css";

export interface ComingSoonHintTrigger {
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

export interface ComingSoonHintProps {
  /** A single focusable element; receives onClick via cloneElement-free render prop. */
  children: (trigger: ComingSoonHintTrigger) => ReactElement;
}

export function ComingSoonHint({ children }: ComingSoonHintProps) {
  const isDesktop = useIsDesktop();
  const [opened, setOpened] = useState(false);

  const { start, clear } = useTimeout(() => setOpened(false), 2000);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      if (!isDesktop) {
        setOpened(true);
        clear();
        start();
      }
    },
    [isDesktop, clear, start],
  );

  if (isDesktop) {
    return (
      <Tooltip
        label="Coming soon"
        withArrow
        openDelay={300}
        events={{ hover: true, focus: true, touch: false }}
      >
        {children({ onClick: handleClick })}
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
      classNames={{ dropdown: classes.dropdown }}
    >
      <Popover.Target>{children({ onClick: handleClick })}</Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" role="status">
          Coming soon
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}
