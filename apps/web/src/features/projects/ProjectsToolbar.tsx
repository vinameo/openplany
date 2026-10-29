import { forwardRef } from "react";
import { Button, Group, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SearchIcon } from "../workspaces/icons";
import classes from "./ProjectsToolbar.module.css";

export interface ProjectsToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  canCreate?: boolean;
  onAddProject?: () => void;
}

export const ProjectsToolbar = forwardRef<
  HTMLInputElement,
  ProjectsToolbarProps
>(function ProjectsToolbar(
  { search, onSearchChange, canCreate = false, onAddProject },
  ref,
) {
  const { t } = useTranslation();
  return (
    <Group wrap="wrap" gap="sm">
      <TextInput
        ref={ref}
        placeholder={t("project:list.searchPlaceholder")}
        aria-label={t("project:list.searchAriaLabel")}
        leftSection={<SearchIcon width={14} height={14} />}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        className={classes.search}
      />
      {canCreate && (
        <Button onClick={onAddProject}>{t("project:list.addProject")}</Button>
      )}
    </Group>
  );
});
