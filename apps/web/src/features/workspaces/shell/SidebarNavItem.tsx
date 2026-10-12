import type { ReactNode } from "react";
import { NavLink } from "@mantine/core";
import { Link } from "react-router";
import { ComingSoonHint } from "../../layout/ComingSoonHint";
import classes from "./sidebarContent.module.css";

export interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  /** Destination. Without one the page is not built yet: the item shows "Coming soon" and has no href. */
  to?: string;
  active?: boolean;
}

/** One entry of a workspace or project sidebar. */
export function SidebarNavItem({
  label,
  icon,
  to,
  active = false,
}: SidebarNavItemProps) {
  if (to === undefined) {
    return (
      <ComingSoonHint>
        {(trigger) => (
          <NavLink
            component="button"
            type="button"
            label={label}
            leftSection={icon}
            aria-disabled="true"
            color="gray"
            variant="light"
            title={label}
            className={classes.navItem}
            onClick={(e) => {
              trigger.onClick(e);
              e.preventDefault();
            }}
          />
        )}
      </ComingSoonHint>
    );
  }

  return (
    <NavLink
      component={Link}
      to={to}
      label={label}
      leftSection={icon}
      active={active}
      color="gray"
      variant="light"
      aria-current={active ? "page" : undefined}
      title={label}
      className={classes.navItem}
    />
  );
}
