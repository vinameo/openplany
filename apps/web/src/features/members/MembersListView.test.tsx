import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { WorkspaceMemberResponse } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { MembersListView } from "./MembersListView";
import { WORKSPACE_ROLE_SCHEME } from "./roleScheme";

const sampleMembers: WorkspaceMemberResponse[] = [
  {
    userId: "u-1",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "kai",
    email: "kai@example.com",
    avatarUrl: null,
    role: "admin",
    accountActive: true,
    joinedAt: "2026-10-01T00:00:00.000Z",
    assignableRoles: [],
  },
  {
    userId: "u-2",
    firstName: "Nam",
    lastName: "Nguyen",
    displayName: "nam",
    email: "nam@example.com",
    avatarUrl: null,
    role: "member",
    accountActive: true,
    joinedAt: "2026-10-02T00:00:00.000Z",
    assignableRoles: [],
  },
];

describe("MembersListView", () => {
  it("renders loading skeleton when status is loading", () => {
    const { container } = render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{ status: "loading" }}
          canSeeEmail={true}
          canAddMember={true}
          onAddMember={vi.fn()}
        />
      </AppUiProvider>,
    );

    const skeletons = container.querySelectorAll(".mantine-Skeleton-root");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error alert and retry button when status is error", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{ status: "error", retry }}
          canSeeEmail={true}
          canAddMember={true}
          onAddMember={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText("Couldn't load members.")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: "Try again" });
    await user.click(retryBtn);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders members list, total badge, toolbar and table when status is ready", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={true}
          onAddMember={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Members", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Kai Tran")).toBeInTheDocument();
    expect(screen.getByText("Nam Nguyen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add member" }),
    ).toBeInTheDocument();
  });

  it("renders truncated alert with formatted listMax and total", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2500,
            truncated: true,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("Showing the first 1,000 of 2,500 members."),
    ).toBeInTheDocument();
  });

  it("renders note and alerts slots when provided", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          note={<div>Custom note under title</div>}
          alerts={<div>No active Admin alert</div>}
        />
      </AppUiProvider>,
    );

    expect(screen.getByText("Custom note under title")).toBeInTheDocument();
    expect(screen.getByText("No active Admin alert")).toBeInTheDocument();
  });

  it("AC-10 / INV-07: renders emptyState when members is empty and emptyState is passed", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: [],
            total: 0,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          emptyState={<div>No members yet in this project.</div>}
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("No members yet in this project."),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("renders default empty state when members match no search result", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
        />
      </AppUiProvider>,
    );

    const searchInput = screen.getByPlaceholderText("Search…");
    await user.type(searchInput, "nonexistent");

    expect(
      screen.getByText("No members match your search"),
    ).toBeInTheDocument();
    const clearBtn = screen.getByRole("button", {
      name: "Clear search and filters",
    });
    await user.click(clearBtn);

    expect(screen.getByText("Kai Tran")).toBeInTheDocument();
  });

  it("renders roleHint tooltip on member role when roleHint returns string", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          roleHint={(m) =>
            m.userId === "u-1" ? "Limited by workspace role" : null
          }
        />
      </AppUiProvider>,
    );

    const hintElement = screen
      .getByText("Admin")
      .closest('[data-tooltipped], [tabindex="0"]');
    expect(hintElement).toBeInTheDocument();
  });

  it("AC-04: uses custom truncatedMessage when provided", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 2500,
            truncated: true,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          truncatedMessage={(shown, total) =>
            `Showing the first ${shown} of ${total} project members.`
          }
        />
      </AppUiProvider>,
    );

    expect(
      screen.getByText("Showing the first 1000 of 2500 project members."),
    ).toBeInTheDocument();
  });

  it("AC-09: renders noneAddedNote when total is 0 and members has rows, without showing emptyState", () => {
    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 0,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          emptyState={<div>No members yet</div>}
          noneAddedNote="No one has been added to this project yet."
        />
      </AppUiProvider>,
    );

    expect(screen.queryByText("No members yet")).not.toBeInTheDocument();
    expect(screen.getByText("Kai Tran")).toBeInTheDocument();
    expect(
      screen.getByText("No one has been added to this project yet."),
    ).toBeInTheDocument();
  });

  it("AC-10: does not render noneAddedNote when search filters out all members", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: sampleMembers,
            total: 0,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          emptyState={<div>No members yet</div>}
          noneAddedNote="No one has been added to this project yet."
        />
      </AppUiProvider>,
    );

    const searchInput = screen.getByPlaceholderText("Search…");
    await user.type(searchInput, "nonexistent");

    expect(
      screen.getByText("No members match your search"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No one has been added to this project yet."),
    ).not.toBeInTheDocument();
  });

  it("AC-10: does not render noneAddedNote when role filter matches no members", async () => {
    const user = userEvent.setup();

    render(
      <AppUiProvider>
        <MembersListView
          scheme={WORKSPACE_ROLE_SCHEME}
          state={{
            status: "ready",
            members: [sampleMembers[0]], // only admin
            total: 0,
            truncated: false,
            listMax: 1000,
          }}
          canSeeEmail={true}
          canAddMember={false}
          onAddMember={vi.fn()}
          emptyState={<div>No members yet</div>}
          noneAddedNote="No one has been added to this project yet."
        />
      </AppUiProvider>,
    );

    const filterBtn = screen.getByRole("button", { name: "Filter by role" });
    await user.click(filterBtn);
    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Member",
    });
    await user.click(memberCheckbox);
    await user.keyboard("{Escape}");

    expect(
      screen.getByText("No members match your search"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No one has been added to this project yet."),
    ).not.toBeInTheDocument();
  });
});
