import { Select, Table, Tooltip, VisuallyHidden } from "@mantine/core";
import {
  type ProjectRole,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
} from "@repo/contracts";
import type { ProjectAccessRow, RolesOverview } from "./rolesOverview";
import classes from "./RoleTables.module.css";

interface WorkspaceRolesTableProps {
  rows: RolesOverview["workspaceRoles"];
}

export function WorkspaceRolesTable({ rows }: WorkspaceRolesTableProps) {
  return (
    <Table.ScrollContainer minWidth={320}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>Workspace roles</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              Role
            </Table.Th>
            <Table.Th scope="col">Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.role}>
              <Table.Th scope="row" className={classes.roleName}>
                {row.label}
              </Table.Th>
              <Table.Td className={classes.descCell}>{row.summary}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

interface ProjectRolesTableProps {
  rows: RolesOverview["projectRoles"];
}

export function ProjectRolesTable({ rows }: ProjectRolesTableProps) {
  return (
    <Table.ScrollContainer minWidth={320}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>Project roles</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              Role
            </Table.Th>
            <Table.Th scope="col">Description</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.role}>
              <Table.Th scope="row" className={classes.roleName}>
                {row.label}
              </Table.Th>
              <Table.Td className={classes.descCell}>{row.summary}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

interface ProjectAccessTableProps {
  rows: ProjectAccessRow[];
}

function renderCell(
  workspaceRoleLabel: string,
  columnName: string,
  role: ProjectRole | null,
  emptyVisuallyHiddenText: string,
  selectData: { value: string; label: string }[],
) {
  if (role === null) {
    return (
      <span>
        <span aria-hidden="true">—</span>
        <VisuallyHidden>{emptyVisuallyHiddenText}</VisuallyHidden>
      </span>
    );
  }

  const tooltipId = `policy-locked-tooltip-${workspaceRoleLabel}-${columnName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  return (
    <Tooltip
      id={tooltipId}
      label="Set by OpenPlany. It can't be changed here."
      withArrow
      multiline
      events={{ hover: true, focus: true, touch: false }}
    >
      <span
        tabIndex={0}
        aria-describedby={tooltipId}
        className={classes.selectWrapper}
      >
        <Select
          data={selectData}
          value={role}
          disabled
          size="xs"
          aria-label={`${workspaceRoleLabel}: ${columnName}`}
          styles={{ input: { pointerEvents: "none" } }}
        />
      </span>
    </Tooltip>
  );
}

export function ProjectAccessTable({ rows }: ProjectAccessTableProps) {
  const selectData = PROJECT_ROLES.map((role) => ({
    value: role,
    label: PROJECT_ROLE_LABELS[role],
  }));

  return (
    <Table.ScrollContainer minWidth={540}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>Workspace roles in projects</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              Workspace role
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              Every project
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              Lowest role when added
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              Highest role when added
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.role}>
              <Table.Th scope="row" className={classes.roleName}>
                {row.label}
              </Table.Th>
              <Table.Td>
                {renderCell(
                  row.label,
                  "Every project",
                  row.everyProject,
                  "Only projects they're added to",
                  selectData,
                )}
              </Table.Td>
              <Table.Td>
                {renderCell(
                  row.label,
                  "Lowest role when added",
                  row.lowest,
                  "Not added to projects",
                  selectData,
                )}
              </Table.Td>
              <Table.Td>
                {renderCell(
                  row.label,
                  "Highest role when added",
                  row.highest,
                  "Not added to projects",
                  selectData,
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
