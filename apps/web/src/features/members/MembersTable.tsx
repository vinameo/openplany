import { type ReactNode } from "react";
import {
  Badge,
  Group,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { WorkspaceRole } from "@repo/contracts";
import { MemberAvatar } from "./MemberAvatar";
import {
  formatJoiningDate,
  memberDisplayName,
  type MemberRowView,
  type MemberSort,
} from "./memberListView";
import { WORKSPACE_ROLE_SCHEME, type RoleScheme } from "./roleScheme";
import { SortableHeader } from "../workspaces/table/SortableHeader";
import dataTableClasses from "../workspaces/table/dataTable.module.css";
import classes from "./MembersTable.module.css";

export interface MembersTableProps<
  R extends string = WorkspaceRole,
  M extends MemberRowView<R> = MemberRowView<R>,
> {
  members: readonly M[];
  scheme?: RoleScheme<R>;
  canSeeEmail: boolean;
  currentSort: MemberSort;
  onSortChange: (sort: MemberSort) => void;
  caption?: string;
  roleHint?: (m: M) => string | null;
  roleBadge?: (m: M) => ReactNode;
  roleControl?: (m: M, roleHint?: string | null) => ReactNode | null;
  isReadOnly?: (m: M) => boolean;
  inheritedRow?: (m: M) => boolean;
}

export function MembersTable<
  R extends string = WorkspaceRole,
  M extends MemberRowView<R> = MemberRowView<R>,
>({
  members,
  scheme = WORKSPACE_ROLE_SCHEME as unknown as RoleScheme<R>,
  canSeeEmail,
  currentSort,
  onSortChange,
  caption,
  roleHint,
  roleBadge,
  roleControl,
  isReadOnly,
  inheritedRow,
}: MembersTableProps<R, M>) {
  const { t } = useTranslation();
  const tableCaption = caption ?? t("workspace:settings.members.caption");

  return (
    <Table.ScrollContainer
      minWidth={760}
      type="native"
      className={dataTableClasses.scrollContainer}
    >
      <Table verticalSpacing="sm" className={dataTableClasses.table}>
        <Table.Caption>
          <VisuallyHidden>{tableCaption}</VisuallyHidden>
        </Table.Caption>
        <colgroup className={canSeeEmail ? classes.withEmail : undefined}>
          <col className={classes.colFullName} />
          <col className={classes.colDisplayName} />
          {canSeeEmail && <col className={classes.colEmail} />}
          <col className={classes.colRole} />
          <col className={classes.colJoined} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader
              title={t("members:table.fullName")}
              sortKey="fullName"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={dataTableClasses.stickyHeader}
            />
            <SortableHeader
              title={t("members:table.displayName")}
              sortKey="displayName"
              currentSort={currentSort}
              onSortChange={onSortChange}
            />
            {canSeeEmail && (
              <SortableHeader
                title={t("members:table.email")}
                sortKey="email"
                currentSort={currentSort}
                onSortChange={onSortChange}
              />
            )}
            <SortableHeader
              title={t("members:table.role")}
              sortKey="role"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.roleHeader}
            />
            <SortableHeader
              title={t("members:table.joiningDate")}
              sortKey="joinedAt"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.dateHeader}
            />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.map((member) => {
            const name = memberDisplayName(member);
            const hint = roleHint?.(member);
            const isInherited = inheritedRow?.(member) === true;
            return (
              <Table.Tr
                key={member.userId}
                className={isInherited ? classes.inheritedRow : undefined}
                data-readonly={isInherited || isReadOnly?.(member) || undefined}
              >
                <Table.Td className={dataTableClasses.stickyColumn}>
                  <Group gap="sm" wrap="nowrap">
                    <MemberAvatar avatarUrl={member.avatarUrl} name={name} />
                    <Text size="sm" fw={500}>
                      {name}
                    </Text>
                    {!member.accountActive && (
                      <Badge
                        color="gray"
                        variant={isInherited ? "default" : "light"}
                        size="xs"
                      >
                        {t("members:cell.deactivated")}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{member.displayName}</Text>
                </Table.Td>
                {canSeeEmail && (
                  <Table.Td>
                    <Text size="sm">{member.email ?? ""}</Text>
                  </Table.Td>
                )}
                <Table.Td className={classes.roleCell}>
                  {(() => {
                    const control = isInherited
                      ? null
                      : roleControl?.(member, hint ?? null);
                    if (control) {
                      return (
                        <Group gap="xs" wrap="nowrap">
                          {control}
                          {roleBadge?.(member)}
                        </Group>
                      );
                    }
                    return (
                      <Group gap="xs" wrap="nowrap">
                        {hint ? (
                          <Tooltip
                            label={hint}
                            withArrow
                            multiline
                            events={{ hover: true, focus: true, touch: true }}
                          >
                            <span
                              tabIndex={0}
                              aria-label={hint}
                              className={classes.roleHintWrapper}
                            >
                              <Text size="sm">
                                {scheme.labels[member.role]}
                              </Text>
                            </span>
                          </Tooltip>
                        ) : (
                          <Text size="sm">{scheme.labels[member.role]}</Text>
                        )}
                        {roleBadge?.(member)}
                      </Group>
                    );
                  })()}
                </Table.Td>
                <Table.Td className={classes.dateCell}>
                  {member.joinedAt === null ? (
                    <Text size="sm">
                      <span aria-hidden="true">—</span>
                      <VisuallyHidden>
                        {t("members:cell.notAddedToProject")}
                      </VisuallyHidden>
                    </Text>
                  ) : (
                    <Text size="sm">{formatJoiningDate(member.joinedAt)}</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
