import { Badge, Group, Table, Text, VisuallyHidden } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AdminUserResponse, AdminUserSortKey } from '@repo/contracts';
import dataTableClasses from '../../workspaces/table/dataTable.module.css';
import { SortableHeader, type SortState } from '../../workspaces/table/SortableHeader';
import { formatCalendarDate } from '../../workspaces/table/formatCalendarDate';
import { MemberAvatar } from '../../members/MemberAvatar';
import { UserRowActions } from './UserRowActions';
import classes from './UsersTable.module.css';

export interface UsersTableProps {
  users: AdminUserResponse[];
  currentSort?: SortState<AdminUserSortKey>;
  onSortChange?: (sort: SortState<AdminUserSortKey>) => void;
  isPlaceholderData?: boolean;
  onEdit?: (user: AdminUserResponse) => void;
  onChangePassword?: (user: AdminUserResponse) => void;
}

export function UsersTable({
  users,
  currentSort = { key: 'createdAt', direction: 'desc' },
  onSortChange = () => {},
  isPlaceholderData = false,
  onEdit,
  onChangePassword,
}: UsersTableProps) {
  const { t } = useTranslation();

  return (
    <Table.ScrollContainer
      minWidth={600}
      type="native"
      className={dataTableClasses.scrollContainer}
    >
      <Table
        verticalSpacing="sm"
        className={`${dataTableClasses.table} ${isPlaceholderData ? classes.tableFaded : ''}`}
      >
        <Table.Caption>
          <VisuallyHidden>{t('admin:users.table.caption')}</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className={dataTableClasses.stickyHeader}>
              <Text size="sm" fw={600}>
                {t('admin:users.table.fullName')}
              </Text>
            </Table.Th>
            <Table.Th className={classes.colDisplayName}>
              <Text size="sm" fw={600}>
                {t('admin:users.table.displayName')}
              </Text>
            </Table.Th>
            <Table.Th>
              <Text size="sm" fw={600}>
                {t('admin:users.table.email')}
              </Text>
            </Table.Th>
            <SortableHeader<AdminUserSortKey>
              title={t('admin:users.table.accountCreated')}
              sortKey="createdAt"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.colAccountCreated}
            />
            <Table.Th style={{ width: 48 }}>
              <VisuallyHidden>{t('admin:users.table.actions')}</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <div className={classes.emptyState}>
                  <Text size="sm" c="dimmed">
                    {t('admin:users.table.empty')}
                  </Text>
                </div>
              </Table.Td>
            </Table.Tr>
          ) : (
            users.map((user) => {
              const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
              const avatarName = fullName || user.displayName || user.email;

              return (
                <Table.Tr key={user.id}>
                  <Table.Td className={dataTableClasses.stickyColumn}>
                    <Group gap={12} align="center" wrap="nowrap">
                      <MemberAvatar avatarUrl={user.avatarUrl} name={avatarName} />
                      <div className={classes.nameInfo}>
                        <Text size="sm" fw={500}>
                          {fullName || '—'}
                        </Text>
                        {user.isInstanceAdmin && (
                          <Badge color="blue" variant="light" size="xs">
                            {t('admin:users.badge.instanceAdmin')}
                          </Badge>
                        )}
                        {!user.isActive && (
                          <Badge color="gray" variant="light" size="xs">
                            {t('admin:users.badge.deactivated')}
                          </Badge>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td className={classes.colDisplayName}>
                    <Text size="sm">{user.displayName || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{user.email}</Text>
                  </Table.Td>
                  <Table.Td className={classes.colAccountCreated}>
                    <Text size="sm">{formatCalendarDate(user.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td style={{ width: 48 }}>
                    <UserRowActions
                      user={user}
                      onEdit={onEdit}
                      onChangePassword={onChangePassword}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
