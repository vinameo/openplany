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
      assignableRoles: [],
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
      assignableRoles: [],
    },
  ],
  total: 2,
  truncated: false,
  addableRoles: ["member", "guest"],
};

function renderMembersApp(
  wsOverrides = {},
  membersData: WorkspaceMemberListResponse | (() => Response) = baseMembersResponse,
  overrideRoutes: Record<string, () => Response> = {},
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
      "workspace.members.add",
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
    ...overrideRoutes,
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
          assignableRoles: [],
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
          assignableRoles: [],
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

  it("leaves the skeleton with an error when GET /members is 403 and the workspace reload fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let workspaceCalls = 0;
    const ws = makeWorkspace({
      id: "ws-1",
      slug: "openstudy",
      name: "OpenStudy",
      permissions: ["workspace.members.view"],
    });

    renderMembersApp(
      { permissions: ["workspace.members.view"] },
      () => apiError(403, "FORBIDDEN", "You don't have permission to do this"),
      {
        "GET /api/workspaces/openstudy": () => {
          workspaceCalls += 1;
          return workspaceCalls === 1
            ? jsonResponse(200, ws)
            : apiError(500, "INTERNAL_ERROR", "Database connection lost");
        },
      },
    );

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("Couldn't load members.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(workspaceCalls).toBe(2);
    consoleError.mockRestore();
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

    const guestCheckbox = await screen.findByRole("checkbox", { name: "Guest" });
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

    const ascOption = await screen.findByRole("menuitem", { name: "Ascending" });
    await user.click(ascOption);

    // In ascending order, Member Bob (rank 20) should appear before Admin Alice (rank 30)
    const rows = screen.getAllByRole("row");
    // Row 0 is header, Row 1 should be Bob, Row 2 should be Alice
    expect(rows[1]).toHaveTextContent("Member Bob");
    expect(rows[2]).toHaveTextContent("Admin Alice");
  });

  it("AC-16 / AC-17: Admin with workspace.members.add sees 'Add member' button and opens modal", async () => {
    const user = userEvent.setup();
    renderMembersApp({
      role: "admin",
      permissions: [
        "workspace.members.view",
        "workspace.members.email.view",
        "workspace.members.add",
      ],
    });

    await screen.findByRole("heading", { name: "Members", level: 2 });
    const addMemberBtn = screen.getByRole("button", { name: "Add member" });
    expect(addMemberBtn).toBeInTheDocument();

    await user.click(addMemberBtn);
    expect(await screen.findByRole("dialog", { name: "Add member" })).toBeInTheDocument();
  });

  it("AC-17: Member without workspace.members.add does not see 'Add member' button", async () => {
    renderMembersApp({
      role: "member",
      permissions: ["workspace.members.view"],
    });

    await screen.findByRole("heading", { name: "Members", level: 2 });
    expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
  });

  it("AC-16: renders plain text role for self and RoleSelectCell for member with multiple assignableRoles", async () => {
    const membersWithAssignableRoles: WorkspaceMemberListResponse = {
      members: [
        {
          userId: "user-1", // self (matching makeSession user-1)
          firstName: "Admin",
          lastName: "Alice",
          displayName: "alice",
          email: "alice@example.com",
          avatarUrl: null,
          role: "admin",
          accountActive: true,
          joinedAt: "2026-10-08T12:00:00.000Z",
          assignableRoles: ["admin"],
        },
        {
          userId: "u-bob",
          firstName: "Bob",
          lastName: "Builder",
          displayName: "bob",
          email: "bob@example.com",
          avatarUrl: null,
          role: "guest",
          accountActive: true,
          joinedAt: "2026-10-08T12:00:00.000Z",
          assignableRoles: ["guest", "member"],
        },
      ],
      total: 2,
      truncated: false,
      addableRoles: ["member", "guest"],
    };

    renderMembersApp({}, membersWithAssignableRoles);

    await screen.findByRole("heading", { name: "Members", level: 2 });

    // Self should NOT have a combobox
    expect(
      screen.queryByRole("combobox", { name: "Role for Admin Alice" }),
    ).not.toBeInTheDocument();

    // Bob should have a combobox
    const bobSelect = screen.getByRole("combobox", { name: "Role for Bob Builder" });
    expect(bobSelect).toBeInTheDocument();
    expect(bobSelect).toHaveValue("Guest");
  });

  it("AC-17: selecting different role opens modal, retains table role on cancel without PATCH", async () => {
    const user = userEvent.setup();
    const membersWithAssignableRoles: WorkspaceMemberListResponse = {
      members: [
        {
          userId: "user-1",
          firstName: "Admin",
          lastName: "Alice",
          displayName: "alice",
          email: "alice@example.com",
          avatarUrl: null,
          role: "admin",
          accountActive: true,
          joinedAt: "2026-10-08T12:00:00.000Z",
          assignableRoles: ["admin"],
        },
        {
          userId: "u-bob",
          firstName: "Bob",
          lastName: "Builder",
          displayName: "bob",
          email: "bob@example.com",
          avatarUrl: null,
          role: "guest",
          accountActive: true,
          joinedAt: "2026-10-08T12:00:00.000Z",
          assignableRoles: ["guest", "member"],
        },
      ],
      total: 2,
      truncated: false,
      addableRoles: ["member", "guest"],
    };

    let patchCalled = false;
    renderMembersApp(
      {},
      membersWithAssignableRoles,
      {
        "GET /api/workspaces/openstudy/members/u-bob/role-change-preview": () =>
          jsonResponse(200, {
            userId: "u-bob",
            fromRole: "guest",
            toRole: "member",
            effect: "apply_project_role",
            affectedProjects: {
              projects: [{ id: "p-1", name: "Alpha", identifier: "ALP" }],
              total: 1,
              hiddenCount: 0,
            },
            projectsLosingAssignedAdmin: {
              projects: [],
              total: 0,
              hiddenCount: 0,
            },
            projectRoleChoices: ["member", "admin", "viewer"],
            defaultProjectRole: "member",
            actorCanChooseProjectRole: true,
          }),
        "PATCH /api/workspaces/openstudy/members/u-bob": () => {
          patchCalled = true;
          return jsonResponse(200, {
            userId: "u-bob",
            role: "member",
            accountActive: true,
            joinedAt: "2026-10-08T12:00:00.000Z",
            assignableRoles: ["guest", "member"],
          });
        },
      },
    );

    await screen.findByRole("heading", { name: "Members", level: 2 });

    const bobSelect = screen.getByRole("combobox", { name: "Role for Bob Builder" });
    await user.click(bobSelect);

    const memberOption = await screen.findByRole("option", { name: "Member" });
    await user.click(memberOption);

    // Modal opens
    const modalTitle = await screen.findByText("Change Bob Builder's role to Member?");
    expect(modalTitle).toBeInTheDocument();

    // Bob select in table still displays Guest (table retains old role while modal is open)
    expect(bobSelect).toHaveValue("Guest");

    // Click Cancel
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText("Change Bob Builder's role to Member?")).not.toBeInTheDocument();
    });

    expect(patchCalled).toBe(false);
    expect(bobSelect).toHaveValue("Guest");
  });
});

