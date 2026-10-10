import { Badge, Group, Table, Text, VisuallyHidden } from "@mantine/core";
import {
  WORKSPACE_ROLE_LABELS,
  type WorkspaceMemberResponse,
} from "@repo/contracts";
import { MemberAvatar } from "./MemberAvatar";
import {
  formatJoiningDate,
  memberDisplayName,
  type MemberSort,
} from "./memberListView";
import { SortableHeader } from "./SortableHeader";
import classes from "./MembersTable.module.css";

interface MembersTableProps {
  members: readonly WorkspaceMemberResponse[];
  canSeeEmail: boolean;
  currentSort: MemberSort;
  onSortChange: (sort: MemberSort) => void;
}

export function MembersTable({
  members,
  canSeeEmail,
  currentSort,
  onSortChange,
}: MembersTableProps) {
  return (
    <Table.ScrollContainer
      minWidth={760}
      type="native"
      className={classes.scrollContainer}
    >
      <Table verticalSpacing="sm" className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>Workspace members</VisuallyHidden>
        </Table.Caption>
        <colgroup>
          <col style={{ width: canSeeEmail ? "26%" : "35%" }} />
          <col style={{ width: canSeeEmail ? "20%" : "27%" }} />
          {canSeeEmail && <col style={{ width: "24%" }} />}
          <col style={{ width: canSeeEmail ? "14%" : "18%" }} />
          <col style={{ width: canSeeEmail ? "16%" : "20%" }} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader
              title="Full name"
              sortKey="fullName"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.stickyHeader}
            />
            <SortableHeader
              title="Display name"
              sortKey="displayName"
              currentSort={currentSort}
              onSortChange={onSortChange}
            />
            {canSeeEmail && (
              <SortableHeader
                title="Email"
                sortKey="email"
                currentSort={currentSort}
                onSortChange={onSortChange}
              />
            )}
            <SortableHeader
              title="Role"
              sortKey="role"
              currentSort={currentSort}
              onSortChange={onSortChange}
              className={classes.roleHeader}
            />
            <SortableHeader
              title="Joining date"
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
            return (
              <Table.Tr key={member.userId}>
                <Table.Td className={classes.stickyColumn}>
                  <Group gap="sm" wrap="nowrap">
                    <MemberAvatar
                      avatarUrl={member.avatarUrl}
                      name={name}
                    />
                    <Text size="sm" fw={500}>
                      {name}
                    </Text>
                    {!member.accountActive && (
                      <Badge color="gray" variant="light" size="xs">
                        Deactivated
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
                  <Text size="sm">{WORKSPACE_ROLE_LABELS[member.role]}</Text>
                </Table.Td>
                <Table.Td className={classes.dateCell}>
                  <Text size="sm">{formatJoiningDate(member.joinedAt)}</Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
