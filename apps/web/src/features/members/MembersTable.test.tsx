import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import type { ProjectRole } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { MembersTable } from "./MembersTable";
import { PROJECT_ROLE_SCHEME } from "./roleScheme";
import type { MemberRowView } from "./memberListView";

interface TestRow extends MemberRowView<ProjectRole> {
  source?: "inherited" | "assigned";
}

const members: TestRow[] = [
  {
    userId: "u-inherited",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "kai",
    email: "kai@example.com",
    role: "admin",
    joinedAt: null,
    accountActive: false, // Deactivated
    source: "inherited",
  },
  {
    userId: "u-assigned",
    firstName: "Nam",
    lastName: "Nguyen",
    displayName: "nam",
    email: "nam@example.com",
    role: "admin",
    joinedAt: "2026-10-01T00:00:00.000Z",
    accountActive: true,
    source: "assigned",
  },
];

describe("MembersTable", () => {
  it("AC-16: does not render roleControl on inherited row even if roleControl always returns a node", () => {
    render(
      <AppUiProvider>
        <MembersTable<ProjectRole, TestRow>
          members={members}
          scheme={PROJECT_ROLE_SCHEME}
          canSeeEmail={true}
          currentSort={{ key: "fullName", direction: "asc" }}
          onSortChange={vi.fn()}
          inheritedRow={(m) => m.source === "inherited"}
          roleControl={(m) => (
            <select aria-label={`Role selector for ${m.displayName}`}>
              <option value="admin">Admin</option>
            </select>
          )}
        />
      </AppUiProvider>,
    );

    // Assigned member should have the role selector
    expect(
      screen.getByRole("combobox", { name: "Role selector for nam" }),
    ).toBeInTheDocument();

    // Inherited member must NOT have the role selector
    expect(
      screen.queryByRole("combobox", { name: "Role selector for kai" }),
    ).not.toBeInTheDocument();
  });

  it("applies inheritedRow class and data-readonly on inherited row", () => {
    const { container } = render(
      <AppUiProvider>
        <MembersTable<ProjectRole, TestRow>
          members={members}
          scheme={PROJECT_ROLE_SCHEME}
          canSeeEmail={true}
          currentSort={{ key: "fullName", direction: "asc" }}
          onSortChange={vi.fn()}
          inheritedRow={(m) => m.source === "inherited"}
        />
      </AppUiProvider>,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);

    // First row (inherited)
    expect(rows[0].className).toContain("inheritedRow");
    expect(rows[0].getAttribute("data-readonly")).toBe("true");

    // Second row (assigned)
    expect(rows[1].className).not.toContain("inheritedRow");
    expect(rows[1].getAttribute("data-readonly")).toBeNull();
  });

  it("uses default variant for Deactivated badge on inherited rows", () => {
    render(
      <AppUiProvider>
        <MembersTable<ProjectRole, TestRow>
          members={members}
          scheme={PROJECT_ROLE_SCHEME}
          canSeeEmail={true}
          currentSort={{ key: "fullName", direction: "asc" }}
          onSortChange={vi.fn()}
          inheritedRow={(m) => m.source === "inherited"}
        />
      </AppUiProvider>,
    );

    const badge = screen.getByText("Deactivated");
    // Mantine default badge variant uses data-variant="default"
    expect(badge.closest(".mantine-Badge-root")).toHaveAttribute(
      "data-variant",
      "default",
    );
  });
});
