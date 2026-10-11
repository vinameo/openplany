import { forwardRef } from "react";
import { Button, Group, TextInput } from "@mantine/core";
import { SearchIcon } from "../workspaces/icons";
import classes from "./ProjectsToolbar.module.css";

export interface ProjectsToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  canCreate?: boolean;
  onAddProject?: () => void;
}

export const ProjectsToolbar = forwardRef<HTMLInputElement, ProjectsToolbarProps>(
  function ProjectsToolbar(
    { search, onSearchChange, canCreate = false, onAddProject },
    ref,
  ) {
    return (
      <Group wrap="wrap" gap="sm">
        <TextInput
          ref={ref}
          placeholder="Search…"
          aria-label="Search projects"
          leftSection={<SearchIcon width={14} height={14} />}
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          className={classes.search}
        />
        {canCreate && (
          <Button onClick={onAddProject}>Add project</Button>
        )}
      </Group>
    );
  },
);
