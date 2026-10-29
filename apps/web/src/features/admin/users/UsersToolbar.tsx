import { useEffect, useState } from "react";
import { Button, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { AdminUserStatusFilter } from "@repo/contracts";
import { PlusIcon, SearchIcon } from "../../workspaces/icons";
import { UsersFilter } from "./UsersFilter";
import classes from "./UsersToolbar.module.css";

export interface UsersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: AdminUserStatusFilter;
  admin?: "only";
  onFilterChange: (filters: {
    status: AdminUserStatusFilter;
    admin?: "only";
  }) => void;
  onClearFilters: () => void;
  onAddUser: () => void;
}

export function UsersToolbar({
  search,
  onSearchChange,
  status,
  admin,
  onFilterChange,
  onClearFilters,
  onAddUser,
}: UsersToolbarProps) {
  const { t } = useTranslation();
  const [localSearch, setLocalSearch] = useState(search);
  const [prevSearch, setPrevSearch] = useState(search);

  if (search !== prevSearch) {
    setPrevSearch(search);
    setLocalSearch(search);
  }

  useEffect(() => {
    if (localSearch === search) return;
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  return (
    <div className={classes.toolbar}>
      <div className={classes.searchGroup}>
        <TextInput
          value={localSearch}
          onChange={(e) => setLocalSearch(e.currentTarget.value)}
          placeholder={t("admin:users.page.searchPlaceholder")}
          aria-label={t("admin:users.page.searchAriaLabel")}
          leftSection={<SearchIcon width={16} height={16} />}
          className={classes.searchInput}
        />
        <UsersFilter
          status={status}
          admin={admin}
          onChange={onFilterChange}
          onClear={onClearFilters}
        />
      </div>

      <div className={classes.actionGroup}>
        <Button
          variant="filled"
          leftSection={<PlusIcon width={16} height={16} />}
          onClick={onAddUser}
        >
          {t("admin:users.page.addUser")}
        </Button>
      </div>
    </div>
  );
}
