import { createElement, useMemo } from "react";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import {
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
} from "@repo/contracts";
import { adjustIconColorForContrast } from "./iconColor";
import { projectIconComponent } from "./projectIcons";

export interface ProjectIconProps {
  icon?: { name: string; color: string } | null;
  size?: number;
  className?: string;
}

export function ProjectIcon({ icon, size = 18, className }: ProjectIconProps) {
  const scheme = useComputedColorScheme("light");
  const theme = useMantineTheme();
  const bg =
    scheme === "dark" ? (theme.colors.dark?.[7] ?? "#0F172A") : "#FFFFFF";

  const color = useMemo(() => {
    return adjustIconColorForContrast(
      icon?.color ?? DEFAULT_PROJECT_ICON_COLOR,
      bg,
    );
  }, [icon?.color, bg]);

  const Comp = projectIconComponent(icon?.name ?? DEFAULT_PROJECT_ICON);

  return createElement(Comp, {
    size,
    color,
    "aria-hidden": "true",
    className,
  });
}
