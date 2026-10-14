import { Anchor, Group, Table, Text, VisuallyHidden } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
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
  sort: SortState<ProjectSortKey>;
  onSortChange: (sort: SortState<ProjectSortKey>) => void;
}

export function ProjectsTable({
  projects,
  workspaceSlug,
  sort,
  onSortChange,
}: ProjectsTableProps) {
  const { t } = useTranslation();
  const tableAriaLabel = t("project:list.tableAriaLabel");

  return (
    <Table.ScrollContainer
      minWidth={600}
      type="native"
      className={dataTableClasses.scrollContainer}
    >
      <Table
        verticalSpacing="sm"
        className={dataTableClasses.table}
        aria-label={tableAriaLabel}
      >
        <Table.Caption>
          <VisuallyHidden>{tableAriaLabel}</VisuallyHidden>
        </Table.Caption>
        <colgroup>
          <col className={classes.colProjectName} />
          <col className={classes.colMembers} />
          <col className={classes.colCreatedDate} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <SortableHeader<ProjectSortKey>
              title={t("project:list.colProjectName")}
              sortKey="name"
              currentSort={sort}
              onSortChange={onSortChange}
              className={dataTableClasses.stickyHeader}
            />
            <Table.Th>{t("project:list.colMembers")}</Table.Th>
            <SortableHeader<ProjectSortKey>
              title={t("project:list.colCreatedDate")}
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
                  {formatCalendarDate(project.createdAt, project.effectiveTimezone)}
                </Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
