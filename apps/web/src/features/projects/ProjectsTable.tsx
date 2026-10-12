import { Anchor, Group, Table, Text, VisuallyHidden } from "@mantine/core";
import { Link } from "react-router";
import type { ProjectListItem } from "@repo/contracts";
import { formatCalendarDate } from "../workspaces/table/formatCalendarDate";
import {
  SortableHeader,
  type SortState,
} from "../workspaces/table/SortableHeader";
import dataTableClasses from "../workspaces/table/dataTable.module.css";
import { ProjectMembersCell } from "./ProjectMembersCell";
import type { ProjectSortKey } from "./projectListView";
import { ProjectIcon } from "./ProjectIcon";
import { projectPath } from "./projectPaths";
import classes from "./ProjectsTable.module.css";

interface ProjectsTableProps {
  projects: readonly ProjectListItem[];
  workspaceSlug: string;
  timeZone?: string;
  sort: SortState<ProjectSortKey>;
  onSortChange: (sort: SortState<ProjectSortKey>) => void;
}

export function ProjectsTable({
  projects,
  workspaceSlug,
  timeZone,
  sort,
  onSortChange,
}: ProjectsTableProps) {
  return (
    <Table.ScrollContainer
      minWidth={600}
      type="native"
      className={dataTableClasses.scrollContainer}
    >
      <Table
        verticalSpacing="sm"
        className={dataTableClasses.table}
        aria-label="Projects"
      >
        <Table.Caption>
          <VisuallyHidden>Projects</VisuallyHidden>
        </Table.Caption>
        <colgroup>
          <col className={classes.colProjectName} />
          <col className={classes.colMembers} />
          <col className={classes.colCreatedDate} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader<ProjectSortKey>
              title="Project Name"
              sortKey="name"
              currentSort={sort}
              onSortChange={onSortChange}
              className={dataTableClasses.stickyHeader}
            />
            <Table.Th>Members</Table.Th>
            <SortableHeader<ProjectSortKey>
              title="Created Date"
              sortKey="createdAt"
              currentSort={sort}
              onSortChange={onSortChange}
            />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {projects.map((project) => (
            <Table.Tr key={project.id}>
              <Table.Td className={dataTableClasses.stickyColumn}>
                <Group gap="xs" wrap="nowrap">
                  <Anchor
                    component={Link}
                    to={projectPath(workspaceSlug, project.identifier)}
                    underline="hover"
                    c="inherit"
                    className={classes.projectNameLink}
                  >
                    <ProjectIcon icon={project.icon} size={18} />
                    <Text size="sm" fw={500} lineClamp={1} title={project.name}>
                      {project.name}
                    </Text>
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {project.identifier}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <ProjectMembersCell
                  members={project.members}
                  memberCount={project.memberCount}
                />
              </Table.Td>
              <Table.Td className={classes.dateCell}>
                <Text size="sm">
                  {formatCalendarDate(project.createdAt, timeZone)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
