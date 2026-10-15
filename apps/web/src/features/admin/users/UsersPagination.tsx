import { Group, Pagination, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ADMIN_USERS_PAGE_SIZE } from '@repo/contracts';

export interface UsersPaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (newPage: number) => void;
}

export function UsersPagination({
  page,
  total,
  pageSize = ADMIN_USERS_PAGE_SIZE,
  onPageChange,
}: UsersPaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1) {
    return null;
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Group justify="space-between" align="center" mt="md" wrap="wrap" gap="sm">
      <Text size="sm" c="dimmed">
        {t('admin:users.table.showing', { from, to, total })}
      </Text>
      <Pagination
        value={page}
        onChange={onPageChange}
        total={totalPages}
        size="sm"
      />
    </Group>
  );
}
