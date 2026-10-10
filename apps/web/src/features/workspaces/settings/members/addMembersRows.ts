import {
  ADD_MEMBERS_MAX,
  type AddWorkspaceMembersRequest,
  type MemberCandidate,
  type WorkspaceRole,
} from "@repo/contracts";

export interface AddMemberRow {
  id: string;
  candidate: MemberCandidate | null;
  role: WorkspaceRole;
  error: string | null;
}

export type AddMemberRowsAction =
  | { type: "add" }
  | { type: "remove"; id: string }
  | { type: "reset" }
  | { type: "select"; id: string; candidate: MemberCandidate | null }
  | { type: "role"; id: string; role: WorkspaceRole }
  | { type: "errors"; byRowId: Record<string, string> };

let idCounter = 0;
export function createRowId(): string {
  idCounter += 1;
  return `row-${Date.now()}-${idCounter}`;
}

export function createInitialRow(defaultRole: WorkspaceRole): AddMemberRow {
  return {
    id: createRowId(),
    candidate: null,
    role: defaultRole,
    error: null,
  };
}

export function addMemberRowsReducer(
  rows: readonly AddMemberRow[],
  action: AddMemberRowsAction,
  ctx: { defaultRole: WorkspaceRole },
): AddMemberRow[] {
  switch (action.type) {
    case "add": {
      if (rows.length >= ADD_MEMBERS_MAX) {
        return [...rows];
      }
      return [
        ...rows,
        {
          id: createRowId(),
          candidate: null,
          role: ctx.defaultRole,
          error: null,
        },
      ];
    }

    case "remove": {
      if (rows.length <= 1) {
        return [...rows];
      }
      return rows.filter((r) => r.id !== action.id);
    }

    case "reset": {
      return [createInitialRow(ctx.defaultRole)];
    }

    case "select": {
      return rows.map((r) =>
        r.id === action.id
          ? { ...r, candidate: action.candidate, error: null }
          : r,
      );
    }

    case "role": {
      return rows.map((r) =>
        r.id === action.id ? { ...r, role: action.role, error: null } : r,
      );
    }

    case "errors": {
      return rows.map((r) => ({
        ...r,
        error: action.byRowId[r.id] ?? r.error,
      }));
    }

    default:
      return [...rows];
  }
}

/** Bỏ dòng trống; trả body + bảng chỉ số request → rowId (WEB-F9). */
export function toAddMembersRequest(rows: readonly AddMemberRow[]): {
  body: AddWorkspaceMembersRequest;
  rowIdByIndex: string[];
} {
  const filled = rows.filter(
    (r): r is AddMemberRow & { candidate: MemberCandidate } =>
      r.candidate !== null,
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

/** fields['members.<i>.userId'] → lỗi theo rowId. Khoá không khớp mẫu bị bỏ qua. */
export function mapFieldErrors(
  fields: Record<string, string>,
  rowIdByIndex: readonly string[],
): Record<string, string> {
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

