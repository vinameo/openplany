import { ActionIcon, UnstyledButton } from "@mantine/core";
import { SearchIcon } from "../workspaces/icons";
import { ComingSoonHint } from "./ComingSoonHint";
import { useIsDesktop } from "./useIsDesktop";
import classes from "./CommandSearchPlaceholder.module.css";

/**
 * Placeholder for command palette search in AppHeader.
 * Accessible, non-clickable button indicating "Coming soon".
 */
export function CommandSearchPlaceholder() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <ComingSoonHint>
        {({ onClick }) => (
          <UnstyledButton
            type="button"
            className={classes.searchBox}
            aria-disabled="true"
            aria-label="Search commands (coming soon)"
            onClick={onClick}
          >
            <SearchIcon width={16} height={16} className={classes.searchIcon} />
            <span className={classes.searchLabel}>Search commands…</span>
          </UnstyledButton>
        )}
      </ComingSoonHint>
    );
  }

  return (
    <ComingSoonHint>
      {({ onClick }) => (
        <ActionIcon
          type="button"
          variant="subtle"
          color="gray"
          aria-disabled="true"
          aria-label="Search commands (coming soon)"
          className={classes.searchIconBtn}
          onClick={onClick}
        >
          <SearchIcon width={18} height={18} />
        </ActionIcon>
      )}
    </ComingSoonHint>
  );
}
