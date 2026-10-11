import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import type { ProjectMemberSummary } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ProjectMembersCell } from "./ProjectMembersCell";

function makeMember(userId: string, first: string, last: string): ProjectMemberSummary {
  return {
    userId,
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`,
    email: `${first.toLowerCase()}@openplany.dev`,
    accountActive: true,
  };
}

describe("ProjectMembersCell", () => {
  it("renders a dash when members is null or empty", () => {
    const { rerender } = render(
      <AppUiProvider>
        <ProjectMembersCell members={null} />
      </AppUiProvider>,
    );
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(
      <AppUiProvider>
        <ProjectMembersCell members={[]} />
      </AppUiProvider>,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders up to 5 member avatars with aria-labels and +N for remaining members", () => {
    const sevenMembers: ProjectMemberSummary[] = [
      makeMember("u-1", "Kai", "Tran"),
      makeMember("u-2", "Nam", "Nguyen"),
      makeMember("u-3", "An", "Le"),
      makeMember("u-4", "Binh", "Pham"),
      makeMember("u-5", "Cuong", "Vu"),
      makeMember("u-6", "Dung", "Hoang"),
      makeMember("u-7", "Em", "Do"),
    ];

    render(
      <AppUiProvider>
        <ProjectMembersCell members={sevenMembers} />
      </AppUiProvider>,
    );

    // First 5 avatars have buttons with their aria-labels
    expect(screen.getByRole("button", { name: "Kai Tran" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nam Nguyen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "An Le" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Binh Pham" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cuong Vu" })).toBeInTheDocument();

    // 6th and 7th members are condensed into +2
    expect(screen.queryByRole("button", { name: "Dung Hoang" })).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
