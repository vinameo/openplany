import { Button, Divider, Popover, Radio, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AdminUserStatusFilter } from '@repo/contracts';
import { FilterIcon } from '../../workspaces/icons';
import classes from './UsersFilter.module.css';

export interface UsersFilterProps {
  status: AdminUserStatusFilter;
  admin?: 'only';
  onChange: (filters: { status: AdminUserStatusFilter; admin?: 'only' }) => void;
  onClear: () => void;
}

export function UsersFilter({
  status,
  admin,
  onChange,
  onClear,
}: UsersFilterProps) {
  const { t } = useTranslation();

  const activeCount = (status !== 'all' ? 1 : 0) + (admin === 'only' ? 1 : 0);
  const filterLabel =
    activeCount > 0
      ? t('admin:users.page.filtersActive', { count: activeCount })
      : t('admin:users.page.filters');

  return (
    <Popover
      position="bottom-start"
      withArrow
      shadow="md"
      withinPortal={false}
    >
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<FilterIcon width={16} height={16} />}
          data-testid="users-filter-button"
        >
          {filterLabel}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="sm" className={classes.dropdown}>
        <Stack gap="sm">
          <div>
            <Text size="xs" fw={600} c="dimmed" mb={6} className={classes.heading}>
              {t('admin:users.filter.status')}
            </Text>
            <Radio.Group
              value={status}
              onChange={(val) =>
                onChange({
                  status: val as AdminUserStatusFilter,
                  admin,
                })
              }
            >
              <Stack gap="xs">
                <Radio value="all" label={t('admin:users.filter.statusAll')} size="sm" />
                <Radio value="active" label={t('admin:users.filter.statusActive')} size="sm" />
                <Radio value="deactivated" label={t('admin:users.filter.statusDeactivated')} size="sm" />
              </Stack>
            </Radio.Group>
          </div>

          <Divider />

          <div>
            <Text size="xs" fw={600} c="dimmed" mb={6} className={classes.heading}>
              {t('admin:users.filter.instanceAdmin')}
            </Text>
            <Radio.Group
              value={admin === 'only' ? 'only' : 'all'}
              onChange={(val) =>
                onChange({
                  status,
                  admin: val === 'only' ? 'only' : undefined,
                })
              }
            >
              <Stack gap="xs">
                <Radio value="all" label={t('admin:users.filter.instanceAdminAll')} size="sm" />
                <Radio value="only" label={t('admin:users.filter.instanceAdminOnly')} size="sm" />
              </Stack>
            </Radio.Group>
          </div>

          {activeCount > 0 && (
            <>
              <Divider />
              <Button
                variant="subtle"
                size="xs"
                color="red"
                onClick={onClear}
                fullWidth
              >
                {t('admin:users.filter.clear')}
              </Button>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
