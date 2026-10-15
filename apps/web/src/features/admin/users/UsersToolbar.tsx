import { Button, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FilterIcon, PlusIcon, SearchIcon } from '../../workspaces/icons';
import classes from './UsersToolbar.module.css';

export interface UsersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  activeFilterCount?: number;
  onFiltersClick?: () => void;
  onAddUser: () => void;
}

export function UsersToolbar({
  search,
  onSearchChange,
  activeFilterCount = 0,
  onFiltersClick,
  onAddUser,
}: UsersToolbarProps) {
  const { t } = useTranslation();

  const filtersLabel =
    activeFilterCount > 0
      ? t('admin:users.page.filtersActive', { count: activeFilterCount })
      : t('admin:users.page.filters');

  return (
    <div className={classes.toolbar}>
      <div className={classes.searchGroup}>
        <TextInput
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder={t('admin:users.page.searchPlaceholder')}
          aria-label={t('admin:users.page.searchAriaLabel')}
          leftSection={<SearchIcon width={16} height={16} />}
          className={classes.searchInput}
        />
        <Button
          variant="default"
          leftSection={<FilterIcon width={16} height={16} />}
          onClick={onFiltersClick}
        >
          {filtersLabel}
        </Button>
      </div>

      <div className={classes.actionGroup}>
        <Button
          variant="filled"
          leftSection={<PlusIcon width={16} height={16} />}
          onClick={onAddUser}
        >
          {t('admin:users.page.addUser')}
        </Button>
      </div>
    </div>
  );
}
