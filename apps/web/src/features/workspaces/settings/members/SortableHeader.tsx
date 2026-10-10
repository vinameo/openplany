import { ActionIcon, Group, Menu, Table, Text } from "@mantine/core";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
} from "../../icons";
import type { MemberSort, MemberSortKey } from "./memberListView";

interface SortableHeaderProps {
  title: string;
  sortKey: MemberSortKey;
  currentSort: MemberSort;
  onSortChange: (sort: MemberSort) => void;
  className?: string;
}

export function SortableHeader({
  title,
  sortKey,
  currentSort,
  onSortChange,
  className,
}: SortableHeaderProps) {
  const isCurrent = currentSort.key === sortKey;
  const ariaSort = isCurrent
    ? currentSort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  const SortIcon = isCurrent
    ? currentSort.direction === "asc"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <Table.Th className={className} aria-sort={ariaSort}>
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Menu position="bottom-start" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="xs"
              color="gray"
              aria-label={`Sort by ${title}`}
            >
              <SortIcon width={14} height={14} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => onSortChange({ key: sortKey, direction: "asc" })}
              rightSection={
                isCurrent && currentSort.direction === "asc" ? (
                  <CheckIcon width={14} height={14} />
                ) : null
              }
            >
              Ascending
            </Menu.Item>
            <Menu.Item
              onClick={() => onSortChange({ key: sortKey, direction: "desc" })}
              rightSection={
                isCurrent && currentSort.direction === "desc" ? (
                  <CheckIcon width={14} height={14} />
                ) : null
              }
            >
              Descending
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Table.Th>
  );
}

