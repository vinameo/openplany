import { ActionIcon, Group, Menu, Table, Text } from "@mantine/core";
import { t } from "i18next";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
} from "../icons";

export interface SortState<K extends string> {
  key: K;
  direction: "asc" | "desc";
}

interface SortableHeaderProps<K extends string> {
  title: string;
  sortKey: K;
  currentSort: SortState<K>;
  onSortChange: (sort: SortState<K>) => void;
  className?: string;
}

export function SortableHeader<K extends string>({
  title,
  sortKey,
  currentSort,
  onSortChange,
  className,
}: SortableHeaderProps<K>) {
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
        <Menu position="bottom-start" withinPortal={false}>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="xs"
              color="gray"
              aria-label={t("common:table.sortBy", { title })}
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
              {t("common:table.ascending")}
            </Menu.Item>
            <Menu.Item
              onClick={() => onSortChange({ key: sortKey, direction: "desc" })}
              rightSection={
                isCurrent && currentSort.direction === "desc" ? (
                  <CheckIcon width={14} height={14} />
                ) : null
              }
            >
              {t("common:table.descending")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Table.Th>
  );
}
