import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import type { WorkspaceMemberResponse } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { MembersTable } from "./MembersTable";

const mockMembers: WorkspaceMemberResponse[] = [
  {
    userId: "u-1",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "Kai Tran",
    email: "kai@openplany.dev",
    avatarUrl: null,
    role: "admin",
    accountActive: true,
    joinedAt: "2026-10-09T10:00:00.000Z",
  },
  {
    userId: "u-2",
    firstName: "Nam",
    lastName: "Nguyen",
    displayName: "Nam Nguyen",
    email: "nam@openplany.dev",
    avatarUrl: null,
    role: "admin",
    accountActive: true,
    joinedAt: "2026-10-11T10:00:00.000Z",
  },
  {
    userId: "u-3",
    firstName: "An",
    lastName: "Nguyen",
    displayName: "An Nguyen",
    email: "an@openplany.dev",
    avatarUrl: null,
    role: "member",
    accountActive: false,
    joinedAt: "2026-10-11T10:00:00.000Z",
  },
];

describe("MembersTable", () => {
  it("renders with 100% width and proportional colgroup when email is visible", () => {
    const onSortChange = vi.fn();
    const { container } = render(
      <AppUiProvider>
        <MembersTable
          members={mockMembers}
          canSeeEmail={true}
          currentSort={{ key: "role", direction: "asc" }}
          onSortChange={onSortChange}
        />
      </AppUiProvider>,
    );

    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();

    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(5);
    expect(cols[0]).toHaveStyle({ width: "26%" });
    expect(cols[1]).toHaveStyle({ width: "20%" });
    expect(cols[2]).toHaveStyle({ width: "24%" });
    expect(cols[3]).toHaveStyle({ width: "14%" });
    expect(cols[4]).toHaveStyle({ width: "16%" });

    // Verify rows rendered
    expect(screen.getAllByText("Kai Tran")).toHaveLength(2);
    expect(screen.getByText("kai@openplany.dev")).toBeInTheDocument();
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
  });

  it("renders with adjusted colgroup when email is hidden", () => {
    const onSortChange = vi.fn();
    const { container } = render(
      <AppUiProvider>
        <MembersTable
          members={mockMembers}
          canSeeEmail={false}
          currentSort={{ key: "fullName", direction: "asc" }}
          onSortChange={onSortChange}
        />
      </AppUiProvider>,
    );

    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(4);
    expect(cols[0]).toHaveStyle({ width: "35%" });
    expect(cols[1]).toHaveStyle({ width: "27%" });
    expect(cols[2]).toHaveStyle({ width: "18%" });
    expect(cols[3]).toHaveStyle({ width: "20%" });

    expect(screen.queryByText("kai@openplany.dev")).not.toBeInTheDocument();
  });
});
