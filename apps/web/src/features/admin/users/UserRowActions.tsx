import { ActionIcon, Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AdminUserResponse } from '@repo/contracts';

export interface UserRowActionsProps {
  user: AdminUserResponse;
  currentUserId?: string;
  onEdit?: (user: AdminUserResponse) => void;
  onChangePassword?: (user: AdminUserResponse) => void;
}

export function UserRowActions({
  user,
  currentUserId,
  onEdit,
  onChangePassword,
}: UserRowActionsProps) {
  const { t } = useTranslation();
  const name =
    user.displayName ||
    `${user.firstName} ${user.lastName}`.trim() ||
    user.email;

  const canChangePassword = Boolean(onChangePassword && user.id !== currentUserId);
  const hasMenuItems = Boolean(onEdit || canChangePassword);

  return (
    <Menu position="bottom-end" withinPortal disabled={!hasMenuItems}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t('admin:users.table.rowActions', { name })}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⋯</span>
        </ActionIcon>
      </Menu.Target>
      {hasMenuItems && (
        <Menu.Dropdown>
          {onEdit && (
            <Menu.Item onClick={() => onEdit(user)}>
              {t('admin:users.menu.edit')}
            </Menu.Item>
          )}
          {canChangePassword && (
            <Menu.Item onClick={() => onChangePassword?.(user)}>
              {t('admin:users.menu.changePassword')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      )}
    </Menu>
  );
}
