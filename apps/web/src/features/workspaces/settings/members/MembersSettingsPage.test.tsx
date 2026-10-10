import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type { WorkspaceMemberListResponse } from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../../auth/AuthProvider";
import { appRoutes } from "../../../../routes";
import { makeSession } from "../../../../test/authFixtures";
import {
  apiError,
  jsonResponse,
  mockFetch,
} from "../../../../test/fetchMock";
import { makeWorkspace } from "../../test/workspaceFixtures";

const baseMembersResponse: WorkspaceMemberListResponse = {
  members: [
    {
      userId: "u-admin",
      firstName: "Admin",
      lastName: "Alice",
      displayName: "alice",
      email: "alice@example.com",
      avatarUrl: null,
      role: "admin",
      accountActive: true,
      joinedAt: "2026-10-08T12:00:00.000Z",
    },
    {
      userId: "u-member",
      firstName: "Member",
      lastName: "Bob",
      displayName: "bob",
      email: "bob@example.com",
      avatarUrl: null,
      role: "member",
      accountActive: false,
      joinedAt: "2026-10-08T12:00:00.000Z",
    },
  ],
  total: 2,
  truncated: false,
  addableRoles: ["member", "guest"],
};

function renderMembersApp(
  wsOverrides = {},
  membersData: WorkspaceMemberListResponse | (() => Response) = baseMembersResponse,
) {
  const ws = makeWorkspace({
    id: "ws-1",
    slug: "openstudy",
    name: "OpenStudy",
    role: "admin",
    permissions: [
      "workspace.settings.update",
      "workspace.members.view",
      "workspace.members.email.view",
    ],
    ...wsOverrides,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/openstudy/settings/members"],
  });

  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
    "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    "GET /api/workspaces/openstudy/members":
      typeof membersData === "function"
        ? membersData
        : () => jsonResponse(200, membersData),
  });

  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, fetchMock, ws };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("MembersSettingsPage", () => {
  it("AC-16: Admin sees title + count, Email column, role label, and no Authentication column", async () => {
    renderMembersApp();

    const heading = await screen.findByRole("heading", {
      name: "Members",
      level: 2,
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    // Table columns
    expect(screen.getByRole("columnheader", { name: "Full name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Display name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Role" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Joining date" })).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Authentication" }),
    ).not.toBeInTheDocument();

    // Rows and data
    const table = screen.getByRole("table");
    expect(within(table).getByText("Admin Alice")).toBeInTheDocument();
    expect(within(table).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Admin")).toBeInTheDocument();
  });

  it("AC-17: Member without email view permission sees table without Email column", async () => {
    renderMembersApp({
      role: "member",
      permissions: ["workspace.members.view"],
    });

    await screen.findByRole("heading", { name: "Members", level: 2 });

    expect(screen.getByRole("columnheader", { name: "Full name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Display name" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Role" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Joining date" })).toBeInTheDocument();
  });

  it("AC-17: Guest without workspace.members.view sees Access Denied", async () => {
    renderMembersApp({
      role: "guest",
      permissions: [],
    });

    const denied = await screen.findByRole("alert");
    expect(denied).toHaveTextContent("Access Denied");
    expect(denied).toHaveTextContent("You don't have access to this page.");
  });

  it("shows Deactivated badge for inactive member account", async () => {
    renderMembersApp();

    await screen.findByText("Member Bob");
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
  });

  it("WEB-10: shows truncated alert when total > 1000", async () => {
    const truncatedResponse: WorkspaceMemberListResponse = {
      ...baseMembersResponse,
      total: 1234,
      truncated: true,
    };
    renderMembersApp({}, truncatedResponse);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Showing the first 1,000 of 1,234 members.");
  });

  it("WEB-19: shows no active Admin alert when every Admin is deactivated", async () => {
    const noActiveAdminResponse: WorkspaceMemberListResponse = {
      ...baseMembersResponse,
      members: [
        {
          userId: "u-admin",
          firstName: "Admin",
          lastName: "Alice",
          displayName: "alice",
          email: "alice@example.com",
          avatarUrl: null,
          role: "admin",
          accountActive: false,
          joinedAt: "2026-10-08T12:00:00.000Z",
        },
        {
          userId: "u-member",
          firstName: "Member",
          lastName: "Bob",
          displayName: "bob",
          email: "bob@example.com",
          avatarUrl: null,
          role: "member",
          accountActive: true,
          joinedAt: "2026-10-08T12:00:00.000Z",
        },
      ],
    };
    renderMembersApp({}, noActiveAdminResponse);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No active Admin. Ask your instance admin for help.",
    );
  });

  it("shows error alert on load failure and retries on Try again", async () => {
    const user = userEvent.setup();
    let failFirst = true;

    renderMembersApp({}, () => {
      if (failFirst) {
        failFirst = false;
        return apiError(500, "INTERNAL_ERROR", "Database connection lost");
      }
      return jsonResponse(200, baseMembersResponse);
    });

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("Couldn't load members.");

    const retryBtn = screen.getByRole("button", { name: "Try again" });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("Admin Alice")).toBeInTheDocument();
    });
  });

  it("AC-18: search input filters members live and shows empty state when no match", async () => {
    const user = userEvent.setup();
    renderMembersApp();

    await screen.findByText("Admin Alice");
    expect(screen.getByText("Member Bob")).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox", { name: "Search members" });
    await user.type(searchInput, "Alice");

    expect(screen.getByText("Admin Alice")).toBeInTheDocument();
    expect(screen.queryByText("Member Bob")).not.toBeInTheDocument();

    // No matches -> empty state
    await user.type(searchInput, "xyz");
    expect(screen.getByText("No members match your search")).toBeInTheDocument();

    // Clear search and filters button restores members
    const clearBtn = screen.getByRole("button", { name: "Clear search and filters" });
    await user.click(clearBtn);

    expect(screen.getByText("Admin Alice")).toBeInTheDocument();
    expect(screen.getByText("Member Bob")).toBeInTheDocument();
  });

  it("AC-18: filters by role and updates filter button label", async () => {
    const user = userEvent.setup();
    renderMembersApp();

    await screen.findByText("Admin Alice");

    const filterBtn = screen.getByRole("button", { name: "Filter by role" });
    expect(filterBtn).toHaveTextContent("Filters");

    await user.click(filterBtn);

    const guestCheckbox = screen.getByRole("checkbox", { name: "Guest" });
    await user.click(guestCheckbox);

    expect(screen.getByRole("button", { name: "Filter by role" })).toHaveTextContent("Filters · 1");
    // Since neither Alice nor Bob is Guest, empty state is displayed
    expect(screen.getByText("No members match your search")).toBeInTheDocument();
  });

  it("AC-18: sorts table columns via sort menu", async () => {
    const user = userEvent.setup();
    renderMembersApp();

    await screen.findByText("Admin Alice");

    // Open Role sort menu and select Ascending
    const sortRoleBtn = screen.getByRole("button", { name: "Sort by Role" });
    await user.click(sortRoleBtn);

    const ascOption = screen.getByRole("menuitem", { name: "Ascending" });
    await user.click(ascOption);

    // In ascending order, Member Bob (rank 20) should appear before Admin Alice (rank 30)
    const rows = screen.getAllByRole("row");
    // Row 0 is header, Row 1 should be Bob, Row 2 should be Alice
    expect(rows[1]).toHaveTextContent("Member Bob");
    expect(rows[2]).toHaveTextContent("Admin Alice");
  });
});

