import {
  ActionIcon,
  useComputedColorScheme,
  useMantineColorScheme,
  type ActionIconProps,
} from "@mantine/core";
import classes from "./ColorSchemeToggle.module.css";

export type ColorSchemeToggleProps = Omit<ActionIconProps, "children">;

/** Switches between light and dark; Mantine persists the choice in localStorage. */
export function ColorSchemeToggle(props: ColorSchemeToggleProps) {
  const { setColorScheme } = useMantineColorScheme();
  // Read during render (no SSR here), so the icon is right on the first paint.
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const isDark = colorScheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <ActionIcon
      variant="default"
      size="lg"
      radius="md"
      aria-label={label}
      title={label}
      onClick={() => setColorScheme(isDark ? "light" : "dark")}
      {...props}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </ActionIcon>
  );
}

function SunIcon() {
  return (
    <svg
      className={classes.sun}
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
