import { Group, Text } from "@mantine/core";
import { andMore, hiddenProjects } from "./membersMessages";

export interface ProjectRef {
  id: string;
  name: string;
  identifier: string;
}

export interface BoundedProjectListProps {
  projects: readonly ProjectRef[];
  total: number;
  hiddenCount: number;
}

export function BoundedProjectList({
  projects,
  total,
  hiddenCount,
}: BoundedProjectListProps) {
  const moreCount = Math.max(0, total - projects.length - hiddenCount);
  const items: string[] = [];

  for (const p of projects) {
    items.push(`${p.name} (${p.identifier})`);
  }

  if (moreCount > 0) {
    items.push(andMore(moreCount));
  }

  if (hiddenCount > 0) {
    items.push(hiddenProjects(hiddenCount));
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Group gap="xs" wrap="wrap">
      {items.map((item, index) => (
        <Text key={index} size="sm" c="dimmed">
          <span aria-hidden="true">· </span>
          {item}
        </Text>
      ))}
    </Group>
  );
}
