import { Select, Table, Tooltip, VisuallyHidden } from "@mantine/core";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <Table.ScrollContainer minWidth={320}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>
            {t("admin:roles.overview.workspaceRolesCaption")}
          </VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              {t("admin:roles.overview.roleCol")}
            </Table.Th>
            <Table.Th scope="col">
              {t("admin:roles.overview.descriptionCol")}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.role}>
              <Table.Th scope="row" className={classes.roleName}>
                {row.label}
              </Table.Th>
              <Table.Td className={classes.descCell}>
                {t(`common:roles.workspace.summary.${row.role}`, {
                  defaultValue: row.summary,
                })}
              </Table.Td>
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
  const { t } = useTranslation();

  return (
    <Table.ScrollContainer minWidth={320}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>
            {t("admin:roles.overview.projectRolesCaption")}
          </VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              {t("admin:roles.overview.roleCol")}
            </Table.Th>
            <Table.Th scope="col">
              {t("admin:roles.overview.descriptionCol")}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.role}>
              <Table.Th scope="row" className={classes.roleName}>
                {row.label}
              </Table.Th>
              <Table.Td className={classes.descCell}>
                {t(`common:roles.project.summary.${row.role}`, {
                  defaultValue: row.summary,
                })}
              </Table.Td>
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
  lockedTooltipText: string,
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
      label={lockedTooltipText}
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
  const { t } = useTranslation();

  const selectData = PROJECT_ROLES.map((role) => ({
    value: role,
    label: PROJECT_ROLE_LABELS[role],
  }));

  const everyProjectCol = t("admin:roles.overview.everyProjectCol");
  const lowestRoleCol = t("admin:roles.overview.lowestRoleCol");
  const highestRoleCol = t("admin:roles.overview.highestRoleCol");
  const lockedTooltip = t("admin:roles.overview.lockedTooltip");
  const onlyAddedProjects = t("admin:roles.overview.onlyAddedProjects");
  const notAddedToProjects = t("admin:roles.overview.notAddedToProjects");

  return (
    <Table.ScrollContainer minWidth={540}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>
            {t("admin:roles.overview.accessCaption")}
          </VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col" className={classes.roleCol}>
              {t("admin:roles.overview.workspaceRoleCol")}
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              {everyProjectCol}
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              {lowestRoleCol}
            </Table.Th>
            <Table.Th scope="col" className={classes.projectRoleCol}>
              {highestRoleCol}
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
                  everyProjectCol,
                  row.everyProject,
                  onlyAddedProjects,
                  selectData,
                  lockedTooltip,
                )}
              </Table.Td>
              <Table.Td>
                {renderCell(
                  row.label,
                  lowestRoleCol,
                  row.lowest,
                  notAddedToProjects,
                  selectData,
                  lockedTooltip,
                )}
              </Table.Td>
              <Table.Td>
                {renderCell(
                  row.label,
                  highestRoleCol,
                  row.highest,
                  notAddedToProjects,
                  selectData,
                  lockedTooltip,
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
