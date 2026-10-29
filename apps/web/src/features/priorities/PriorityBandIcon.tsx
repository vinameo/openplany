import { useMemo } from "react";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import {
  DEFAULT_PRIORITIES,
  INITIAL_PRIORITY_KEY,
  type PriorityBand,
} from "@repo/contracts";
import {
  adjustIconColorForContrast,
  relativeLuminance,
} from "../projects/iconColor";
import classes from "./PriorityBandIcon.module.css";

export interface PriorityBandIconProps {
  band: PriorityBand;
  color?: string | null;
  size?: number;
  className?: string;
}

const DEFAULT_NONE_COLOR =
  DEFAULT_PRIORITIES.find((p) => p.key === INITIAL_PRIORITY_KEY)?.color ??
  "#8E98A8";

export function PriorityBandIcon({
  band,
  color: rawColor,
  size = 14,
  className,
}: PriorityBandIconProps) {
  const scheme = useComputedColorScheme("light");
  const theme = useMantineTheme();
  const bg =
    scheme === "dark" ? (theme.colors.dark?.[7] ?? "#0F172A") : "#FFFFFF";

  const color = useMemo(() => {
    return adjustIconColorForContrast(rawColor ?? DEFAULT_NONE_COLOR, bg);
  }, [rawColor, bg]);

  const innerColor = relativeLuminance(color) > 0.45 ? "#1A1A1A" : "#FFFFFF";
  const iconClass = className ? `${classes.icon} ${className}` : classes.icon;

  if (band === "urgent") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        data-band="urgent"
        className={iconClass}
      >
        <rect x="2" y="2" width="12" height="12" rx="3" fill={color} />
        <path
          d="M8 5v3.5M8 11v.5"
          stroke={innerColor}
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (band === "high") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        data-band="high"
        className={iconClass}
      >
        <rect x="2.5" y="10" width="2.5" height="4" rx="1" fill={color} />
        <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="1" fill={color} />
        <rect x="11" y="3" width="2.5" height="11" rx="1" fill={color} />
      </svg>
    );
  }

  if (band === "medium") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        data-band="medium"
        className={iconClass}
      >
        <rect x="2.5" y="10" width="2.5" height="4" rx="1" fill={color} />
        <rect x="6.75" y="6.5" width="2.5" height="7.5" rx="1" fill={color} />
        <rect
          x="11"
          y="3"
          width="2.5"
          height="11"
          rx="1"
          fill={color}
          opacity={0.3}
        />
      </svg>
    );
  }

  if (band === "low") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        data-band="low"
        className={iconClass}
      >
        <rect x="2.5" y="10" width="2.5" height="4" rx="1" fill={color} />
        <rect
          x="6.75"
          y="6.5"
          width="2.5"
          height="7.5"
          rx="1"
          fill={color}
          opacity={0.3}
        />
        <rect
          x="11"
          y="3"
          width="2.5"
          height="11"
          rx="1"
          fill={color}
          opacity={0.3}
        />
      </svg>
    );
  }

  // none band
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      aria-hidden="true"
      data-band="none"
      className={iconClass}
    >
      <circle cx="8" cy="8" r="6" />
      <line x1="3.8" y1="12.2" x2="12.2" y2="3.8" strokeLinecap="round" />
    </svg>
  );
}
