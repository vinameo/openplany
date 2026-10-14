import { Fragment } from "react";
import { Badge, Checkbox, Table, Tooltip, VisuallyHidden } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { RoleRef } from "@repo/contracts";
import { LockIcon } from "../../workspaces/icons";
import type { PermissionMatrixModel } from "./permissionMatrix";
import classes from "./PermissionMatrixTable.module.css";

interface PermissionMatrixTableProps {
  matrix: PermissionMatrixModel;
  readOnly?: boolean;
  onToggle: (role: RoleRef, permission: string) => void;
}

export function PermissionMatrixTable({
  matrix,
  readOnly = false,
  onToggle,
}: PermissionMatrixTableProps) {
  const { t } = useTranslation();
  const captionText =
    matrix.scope === "workspace"
      ? t("admin:roles.matrix.workspaceCaption")
      : t("admin:roles.matrix.projectCaption");

  const minWidth = matrix.scope === "workspace" ? 320 : 520;

  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>{captionText}</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">
              {t("admin:roles.matrix.permissionCol")}
            </Table.Th>
            {matrix.roles.map((role) => (
              <Table.Th
                key={role.ref.key}
                scope="col"
                className={classes.roleCol}
              >
                {role.locked ? (
                  <span className={classes.lockedHeader}>
                    {role.label}
                    <LockIcon className={classes.lockIcon} aria-hidden="true" />
                    <VisuallyHidden>
                      {t("admin:roles.matrix.locked")}
                    </VisuallyHidden>
                  </span>
                ) : (
                  role.label
                )}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {matrix.groups.map((group) => {
            const groupHeaderTitle = group.groupKey
              ? t(group.groupKey, { defaultValue: group.label })
              : group.label;
            return (
              <Fragment key={group.groupKey ?? group.label}>
                <Table.Tr>
                  <Table.Th
                    colSpan={matrix.roles.length + 1}
                    scope="colgroup"
                    className={classes.groupHeader}
                  >
                    {groupHeaderTitle}
                  </Table.Th>
                </Table.Tr>
                {group.rows.map((row) => {
                  const rowLabel = t(`permissions:${row.permission}`, {
                    defaultValue: row.label,
                  });
                  return (
                    <Table.Tr key={row.permission}>
                      <Table.Th scope="row" className={classes.permissionTh}>
                        <div className={classes.permissionContent}>
                          <span>{rowLabel}</span>
                          {!row.enforced && (
                            <Badge size="xs" variant="light" color="gray">
                              {t("admin:roles.matrix.notEnforced")}
                            </Badge>
                          )}
                        </div>
                      </Table.Th>
                      {row.cells.map((cell) => {
                        const cellReasonId = cell.disabledReason
                          ? `reason-${cell.role.scope}-${cell.role.key}-${row.permission.replace(/\./g, "-")}`
                          : undefined;
                        const roleLabel =
                          matrix.roles.find((r) => r.ref.key === cell.role.key)
                            ?.label ?? cell.role.key;

                        const checkboxElement = (
                          <span className={classes.cellWrapper}>
                            <Checkbox
                              aria-label={`${roleLabel}: ${rowLabel}`}
                              aria-describedby={cellReasonId}
                              checked={cell.checked}
                              disabled={
                                readOnly || cell.disabledReason !== null
                              }
                              onChange={() =>
                                onToggle(cell.role, row.permission)
                              }
                            />
                            {cell.disabledReason && (
                              <VisuallyHidden id={cellReasonId}>
                                {cell.disabledReason}
                              </VisuallyHidden>
                            )}
                            {cell.changed && (
                              <>
                                <span
                                  className={classes.changedDot}
                                  aria-hidden="true"
                                />
                                <VisuallyHidden>
                                  {t("admin:roles.matrix.changed")}
                                </VisuallyHidden>
                              </>
                            )}
                          </span>
                        );

                        return (
                          <Table.Td
                            key={cell.role.key}
                            className={classes.checkCell}
                          >
                            {cell.disabledReason ? (
                              <Tooltip
                                label={cell.disabledReason}
                                withArrow
                                position="top"
                              >
                                {checkboxElement}
                              </Tooltip>
                            ) : (
                              checkboxElement
                            )}
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  );
                })}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
