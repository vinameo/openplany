import {
  Badge,
  Button,
  Group,
  Table,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { AdminUserResponse, AdminUserSortKey } from "@repo/contracts";
import dataTableClasses from "../../workspaces/table/dataTable.module.css";
import {
  SortableHeader,
  type SortState,
} from "../../workspaces/table/SortableHeader";
import { formatCalendarDate } from "../../workspaces/table/formatCalendarDate";
import { MemberAvatar } from "../../members/MemberAvatar";
import { UserRowActions } from "./UserRowActions";
import classes from "./UsersTable.module.css";

export interface UsersTableProps {
  users: AdminUserResponse[];
  currentUserId?: string;
  currentSort?: SortState<AdminUserSortKey>;
  onSortChange?: (sort: SortState<AdminUserSortKey>) => void;
  isPlaceholderData?: boolean;
  onClearFilters?: () => void;
  onEdit?: (user: AdminUserResponse) => void;
  onChangePassword?: (user: AdminUserResponse) => void;
}

export function UsersTable({
  users,
  currentUserId,
  currentSort = { key: "createdAt", direction: "desc" },
  onSortChange = () => {},
  isPlaceholderData = false,
  onClearFilters,
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
        className={`${dataTableClasses.table} ${isPlaceholderData ? classes.tableFaded : ""}`}
      >
        <Table.Caption>
          <VisuallyHidden>{t("admin:users.table.caption")}</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader<AdminUserSortKey>
              title={t("admin:users.table.fullName")}
              sortKey="fullName"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={dataTableClasses.stickyHeader}
            />
            <SortableHeader<AdminUserSortKey>
              title={t("admin:users.table.displayName")}
              sortKey="displayName"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.colDisplayName}
            />
            <SortableHeader<AdminUserSortKey>
              title={t("admin:users.table.email")}
              sortKey="email"
              currentSort={currentSort}
              onSortChange={onSortChange}
            />
            <SortableHeader<AdminUserSortKey>
              title={t("admin:users.table.accountCreated")}
              sortKey="createdAt"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.colAccountCreated}
            />
            <Table.Th style={{ width: 48 }}>
              <VisuallyHidden>{t("admin:users.table.actions")}</VisuallyHidden>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <div className={classes.emptyState}>
                  <Text size="sm" c="dimmed">
                    {t("admin:users.table.empty")}
                  </Text>
                  {onClearFilters && (
                    <Button variant="subtle" size="xs" onClick={onClearFilters}>
                      {t("admin:users.table.clearAll")}
                    </Button>
                  )}
                </div>
              </Table.Td>
            </Table.Tr>
          ) : (
            users.map((user) => {
              const fullName = [user.firstName, user.lastName]
                .filter(Boolean)
                .join(" ");
              const avatarName = fullName || user.displayName || user.email;

              return (
                <Table.Tr key={user.id}>
                  <Table.Td className={dataTableClasses.stickyColumn}>
                    <Group gap={12} align="center" wrap="nowrap">
                      <MemberAvatar
                        avatarUrl={user.avatarUrl}
                        name={avatarName}
                      />
                      <div className={classes.nameInfo}>
                        <Text size="sm" fw={500}>
                          {fullName || "—"}
                        </Text>
                        {user.isInstanceAdmin && (
                          <Badge color="blue" variant="light" size="xs">
                            {t("admin:users.badge.instanceAdmin")}
                          </Badge>
                        )}
                        {!user.isActive && (
                          <Badge color="gray" variant="light" size="xs">
                            {t("admin:users.badge.deactivated")}
                          </Badge>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td className={classes.colDisplayName}>
                    <Text size="sm">{user.displayName || "—"}</Text>
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
                      currentUserId={currentUserId}
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
