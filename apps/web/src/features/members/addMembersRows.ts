import { ADD_MEMBERS_MAX, type WorkspaceRole } from "@repo/contracts";

export interface AddMemberRow<R = WorkspaceRole, C = { userId: string }> {
  id: string;
  candidate: C | null;
  role: R;
  error: string | null; // error below candidate input (.userId)
  roleError: string | null; // error below role select (.role)
  roleNotice: string | null; // notice below row ("Limited to ...")
}

export interface RowsContext<
  R extends string = WorkspaceRole,
  C = { userId: string },
> {
  defaultRole: R;
  /** When undefined, roles are not limited by candidate (workspace). */
  rolesFor?: (candidate: C) => readonly R[];
  rank?: Readonly<Record<R, number>>;
  closest?: (
    currentRole: R,
    allowed: readonly R[],
  ) => { role: R; reason: "lowered" | "raised" } | null;
  highest?: (roles: readonly R[]) => R | null;
  roleNotice?: (info: {
    role: R;
    reason: "lowered" | "raised";
    candidate: C;
  }) => string | null;
  limitedNotice?: (role: R) => string;
}

export type RowFieldError = string | { userId?: string; role?: string };

export type AddMemberRowsAction<R = WorkspaceRole, C = { userId: string }> =
  | { type: "add" }
  | { type: "remove"; id: string }
  | { type: "reset" }
  | { type: "select"; id: string; candidate: C | null }
  | { type: "role"; id: string; role: R }
  | { type: "errors"; byRowId: Record<string, RowFieldError> };

let idCounter = 0;
export function createRowId(): string {
  idCounter += 1;
  return `row-${Date.now()}-${idCounter}`;
}

export function createInitialRow<R, C = { userId: string }>(
  defaultRole: R,
): AddMemberRow<R, C> {
  return {
    id: createRowId(),
    candidate: null,
    role: defaultRole,
    error: null,
    roleError: null,
    roleNotice: null,
  };
}

export function addMemberRowsReducer<
  R extends string,
  C extends { userId: string },
>(
  rows: readonly AddMemberRow<R, C>[],
  action: AddMemberRowsAction<R, C>,
  ctx: RowsContext<R, C>,
): AddMemberRow<R, C>[] {
  switch (action.type) {
    case "add": {
      if (rows.length >= ADD_MEMBERS_MAX) {
        return [...rows];
      }
      return [...rows, createInitialRow<R, C>(ctx.defaultRole)];
    }

    case "remove": {
      if (rows.length <= 1) {
        return [...rows];
      }
      return rows.filter((r) => r.id !== action.id);
    }

    case "reset": {
      return [createInitialRow<R, C>(ctx.defaultRole)];
    }

    case "select": {
      return rows.map((r) => {
        if (r.id !== action.id) return r;
        if (!action.candidate) {
          return {
            ...r,
            candidate: null,
            roleNotice: null,
            error: null,
            roleError: null,
          };
        }

        let newRole = r.role;
        let roleNotice: string | null = null;
        if (ctx.rolesFor) {
          const allowed = ctx.rolesFor(action.candidate);
          if (!allowed.includes(r.role)) {
            let chosen: R | null = null;
            let reason: "lowered" | "raised" = "lowered";

            if (ctx.closest) {
              const res = ctx.closest(r.role, allowed);
              if (res) {
                chosen = res.role;
                reason = res.reason;
              }
            } else if (ctx.rank) {
              const currRank = ctx.rank[r.role];
              const atOrBelow = allowed.filter(
                (role) => ctx.rank![role] <= currRank,
              );
              if (atOrBelow.length > 0) {
                chosen = atOrBelow.reduce((prev, role) =>
                  ctx.rank![role] > ctx.rank![prev] ? role : prev,
                );
                reason = "lowered";
              } else if (allowed.length > 0) {
                chosen = allowed.reduce((prev, role) =>
                  ctx.rank![role] < ctx.rank![prev] ? role : prev,
                );
                reason = "raised";
              }
            } else if (ctx.highest) {
              chosen = ctx.highest(allowed);
              reason = "lowered";
            }

            if (chosen) {
              newRole = chosen;
              if (ctx.roleNotice) {
                roleNotice = ctx.roleNotice({
                  role: newRole,
                  reason,
                  candidate: action.candidate,
                });
              } else if (ctx.limitedNotice && reason === "lowered") {
                roleNotice = ctx.limitedNotice(newRole);
              }
            }
          }
        }

        return {
          ...r,
          candidate: action.candidate,
          role: newRole,
          roleNotice,
          error: null,
          roleError: null,
        };
      });
    }

    case "role": {
      return rows.map((r) =>
        r.id === action.id
          ? {
              ...r,
              role: action.role,
              error: null,
              roleError: null,
              roleNotice: null,
            }
          : r,
      );
    }

    case "errors": {
      return rows.map((r) => {
        const err = action.byRowId[r.id];
        if (!err) return r;
        if (typeof err === "string") {
          return { ...r, error: err };
        }
        return {
          ...r,
          error: err.userId ?? r.error,
          roleError: err.role ?? r.roleError,
        };
      });
    }

    default:
      return [...rows];
  }
}

/** Omit empty rows; return body + index-to-rowId mapping (WEB-F9). */
export function toAddMembersRequest<
  R extends string,
  C extends { userId: string },
>(
  rows: readonly AddMemberRow<R, C>[],
): {
  body: { members: { userId: string; role: R }[] };
  rowIdByIndex: string[];
} {
  const filled = rows.filter(
    (r): r is AddMemberRow<R, C> & { candidate: C } => r.candidate !== null,
  );

  return {
    body: {
      members: filled.map((r) => ({
        userId: r.candidate.userId,
        role: r.role,
      })),
    },
    rowIdByIndex: filled.map((r) => r.id),
  };
}

/** fields['members.<i>.userId' | 'members.<i>.role'] -> error mapped to rowId. */
export function mapFieldErrors(
  fields: Record<string, string>,
  rowIdByIndex: readonly string[],
): Record<string, RowFieldError> {
  const hasRoleField = Object.keys(fields).some((k) =>
    /^members\.\d+\.role$/.test(k),
  );

  if (hasRoleField) {
    const result: Record<string, { userId?: string; role?: string }> = {};
    for (const [key, message] of Object.entries(fields)) {
      const match = /^members\.(\d+)\.(userId|role)$/.exec(key);
      if (match && match[1] && match[2]) {
        const index = parseInt(match[1], 10);
        const fieldName = match[2] as "userId" | "role";
        const rowId = rowIdByIndex[index];
        if (rowId) {
          if (!result[rowId]) result[rowId] = {};
          result[rowId][fieldName] = message;
        }
      }
    }
    return result;
  }

  const result: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const match = /^members\.(\d+)\.userId$/.exec(key);
    if (match && match[1]) {
      const index = parseInt(match[1], 10);
      const rowId = rowIdByIndex[index];
      if (rowId) {
        result[rowId] = message;
      }
    }
  }
  return result;
}
