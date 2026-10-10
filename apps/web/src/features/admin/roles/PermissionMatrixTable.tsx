import { Fragment } from "react";
import {
  Badge,
  Checkbox,
  Table,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
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
  const captionText =
    matrix.scope === "workspace"
      ? "Workspace permissions by role"
      : "Project permissions by role";

  const minWidth = matrix.scope === "workspace" ? 320 : 520;

  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table withTableBorder withColumnBorders className={classes.table}>
        <Table.Caption>
          <VisuallyHidden>{captionText}</VisuallyHidden>
        </Table.Caption>
        <Table.Thead>
          <Table.Tr>
            <Table.Th scope="col">Permission</Table.Th>
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
                    <VisuallyHidden>locked</VisuallyHidden>
                  </span>
                ) : (
                  role.label
                )}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {matrix.groups.map((group) => (
            <Fragment key={group.label}>
              <Table.Tr>
                <Table.Th
                  colSpan={matrix.roles.length + 1}
                  scope="colgroup"
                  className={classes.groupHeader}
                >
                  {group.label}
                </Table.Th>
              </Table.Tr>
              {group.rows.map((row) => (
                <Table.Tr key={row.permission}>
                  <Table.Th scope="row" className={classes.permissionTh}>
                    <div className={classes.permissionContent}>
                      <span>{row.label}</span>
                      {!row.enforced && (
                        <Badge size="xs" variant="light" color="gray">
                          Not enforced yet
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
                          aria-label={`${roleLabel}: ${row.label}`}
                          aria-describedby={cellReasonId}
                          checked={cell.checked}
                          disabled={readOnly || cell.disabledReason !== null}
                          onChange={() => onToggle(cell.role, row.permission)}
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
                            <VisuallyHidden>changed</VisuallyHidden>
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
              ))}
            </Fragment>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
