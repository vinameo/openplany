import { Table, VisuallyHidden } from "@mantine/core";
import { PROJECT_ROLE_LABELS } from "@repo/contracts";
import type { RolesOverview } from "./rolesOverview";
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
  rows: RolesOverview["projectAccess"];
}

export function ProjectAccessTable({ rows }: ProjectAccessTableProps) {
  return (
    <Table.ScrollContainer minWidth={320}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>Project access by workspace role</VisuallyHidden>
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
              Highest project role
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
                {row.everyProject ? (
                  PROJECT_ROLE_LABELS[row.everyProject]
                ) : (
                  <span>
                    <span aria-hidden="true">—</span>
                    <VisuallyHidden>Only projects they're added to</VisuallyHidden>
                  </span>
                )}
              </Table.Td>
              <Table.Td>{PROJECT_ROLE_LABELS[row.highestProjectRole]}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

