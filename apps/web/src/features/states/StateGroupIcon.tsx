import { useMemo } from "react";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { DEFAULT_STATE_COLOR, type StateGroup } from "@repo/contracts";
import {
  adjustIconColorForContrast,
  relativeLuminance,
} from "../projects/iconColor";
import classes from "./StateGroupIcon.module.css";

export interface StateGroupIconProps {
  group: StateGroup;
  color?: string | null;
  size?: number;
  className?: string;
}

export function StateGroupIcon({
  group,
  color: rawColor,
  size = 14,
  className,
}: StateGroupIconProps) {
  const scheme = useComputedColorScheme("light");
  const theme = useMantineTheme();
  const bg =
    scheme === "dark" ? (theme.colors.dark?.[7] ?? "#0F172A") : "#FFFFFF";

  const color = useMemo(() => {
    return adjustIconColorForContrast(rawColor ?? DEFAULT_STATE_COLOR, bg);
  }, [rawColor, bg]);

  const innerColor = relativeLuminance(color) > 0.45 ? "#1A1A1A" : "#FFFFFF";

  const iconClass = className ? `${classes.icon} ${className}` : classes.icon;

  if (group === "backlog") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-group="backlog"
        className={iconClass}
      >
        <circle cx="8" cy="8" r="6" strokeDasharray="1.5 2.5" />
      </svg>
    );
  }

  if (group === "planned") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-group="planned"
        className={iconClass}
      >
        <circle cx="8" cy="8" r="6" strokeDasharray="3.5 2.5" />
      </svg>
    );
  }

  if (group === "active") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        data-group="active"
        className={iconClass}
      >
        <circle cx="8" cy="8" r="6" />
        <circle cx="8" cy="8" r="2" fill={color} stroke="none" />
      </svg>
    );
  }

  if (group === "finished") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        data-group="finished"
        className={iconClass}
      >
        <circle cx="8" cy="8" r="6.5" fill={color} />
        <path
          d="M5 8.2l2 2 4.2-4.2"
          stroke={innerColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // cancelled
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-group="cancelled"
      className={iconClass}
    >
      <circle cx="8" cy="8" r="6.5" fill={color} />
      <path
        d="M5.5 5.5l5 5M10.5 5.5l-5 5"
        stroke={innerColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
