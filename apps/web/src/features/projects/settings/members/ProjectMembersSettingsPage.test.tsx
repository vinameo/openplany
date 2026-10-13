import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import type {
  ProjectListItem,
  ProjectMemberListResponse,
  ProjectMemberResponse,
} from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../../routes";
import { makeSession } from "../../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { AuthProvider } from "../../../auth/AuthProvider";
import { makeWorkspace } from "../../../workspaces/test/workspaceFixtures";
import {
  NO_MEMBERS_YET,
  ROLE_LIMITED_TOOLTIP,
  WORKSPACE_ADMINS_NOTE,
} from "./projectMembersMessages";

const baseWorkspace = makeWorkspace({
  id: "ws-1",
  slug: "the-firsts",
  name: "The Firsts Workspace",
  timezone: "Asia/Ho_Chi_Minh",
  role: "admin",
  permissions: ["workspace.members.email.view"],
});

const sampleProject: ProjectListItem = {
  id: "p-11",
  name: "The First Project",
  identifier: "TFP11",
  description: "Initial description",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
  timezone: null,
  effectiveTimezone: "Asia/Ho_Chi_Minh",
  members: [],
  memberCount: 2,
  role: "admin",
  permissions: [
    "project.settings.view",
    "project.settings.update",
    "project.members.view",
    "project.members.manage",
  ],
};

function renderMembersApp({
  initialEntries = ["/the-firsts/projects/TFP11/settings/members"],
  project = sampleProject,
  workspace = baseWorkspace,
  membersResponse = {
    members: [],
    total: 0,
    truncated: false,
    addableRoles: ["admin", "contributor", "commenter", "viewer"],
  },
}: {
  initialEntries?: string[];
  project?: ProjectListItem;
  workspace?: ReturnType<typeof makeWorkspace>;
  membersResponse?: ProjectMemberListResponse;
} = {}) {
  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces: [workspace],
        lastWorkspaceSlug: "the-firsts",
      }),
    "GET /api/workspaces/the-firsts": () => jsonResponse(200, workspace),
    "GET /api/workspaces/the-firsts/projects/TFP11": () =>
      jsonResponse(200, { project }),
    "GET /api/workspaces/the-firsts/projects/TFP11/members": () =>
      jsonResponse(200, membersResponse),
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries,
  });

  const utils = render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, ...utils };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProjectMembersSettingsPage", () => {
  const memberKai: ProjectMemberResponse = {
    userId: "u-kai",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "kaitran",
    email: "kai@openplany.dev",
    avatarUrl: null,
    role: "admin",
    assignedRole: "admin",
    roleLimited: false,
    joinedAt: "2026-10-12T10:00:00.000Z",
    accountActive: true,
  };

  const memberNam: ProjectMemberResponse = {
    userId: "u-nam",
    firstName: "Nam",
    lastName: "Nguyen",
    displayName: "namnguyen",
    email: "nam@openplany.dev",
    avatarUrl: null,
    role: "admin",
    assignedRole: "admin",
    roleLimited: false,
    joinedAt: "2026-10-12T10:00:00.000Z",
    accountActive: true,
  };

  it("AC-01: Nam without email view permission sees count, note, members table, NO email column, and sees Add member button", async () => {
    const workspaceNam = makeWorkspace({
      id: "ws-1",
      slug: "the-firsts",
      name: "The Firsts Workspace",
      role: "member",
      permissions: [], // lacks workspace.members.email.view
    });

    const membersData: ProjectMemberListResponse = {
      members: [memberKai, memberNam],
      total: 2,
      truncated: false,
      addableRoles: ["admin", "contributor", "commenter", "viewer"],
    };

    renderMembersApp({
      workspace: workspaceNam,
      membersResponse: membersData,
    });

    expect(await screen.findByText(WORKSPACE_ADMINS_NOTE)).toBeInTheDocument();
    expect(screen.getByText("Kai Tran")).toBeInTheDocument();
    expect(screen.getByText("Nam Nguyen")).toBeInTheDocument();

    // No Email column
    expect(
      screen.queryByRole("columnheader", { name: /^email$/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("kai@openplany.dev")).not.toBeInTheDocument();

    // Add member button is visible
    expect(
      screen.getByRole("button", { name: /^add member$/i }),
    ).toBeInTheDocument();
  });

  it("AC-05: Contributor without addableRoles does not see Add member button", async () => {
    const membersData: ProjectMemberListResponse = {
      members: [memberKai, memberNam],
      total: 2,
      truncated: false,
      addableRoles: [], // no addable roles
    };

    renderMembersApp({
      membersResponse: membersData,
    });

    expect(await screen.findByText(WORKSPACE_ADMINS_NOTE)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^add member$/i }),
    ).not.toBeInTheDocument();
  });

  it("AC-03: Kai with email view permission sees Email column with full email addresses", async () => {
    const membersData: ProjectMemberListResponse = {
      members: [memberKai, memberNam],
      total: 2,
      truncated: false,
      addableRoles: ["admin", "contributor", "commenter", "viewer"],
    };

    renderMembersApp({
      workspace: baseWorkspace, // has workspace.members.email.view
      membersResponse: membersData,
    });

    expect(
      await screen.findByRole("columnheader", { name: /^email$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("kai@openplany.dev")).toBeInTheDocument();
    expect(screen.getByText("nam@openplany.dev")).toBeInTheDocument();
  });

  it("AC-06: Viewer project member without project.members.view sees Access Denied", async () => {
    const viewerProject: ProjectListItem = {
      ...sampleProject,
      role: "viewer",
      permissions: [], // no project.members.view
    };

    renderMembersApp({
      project: viewerProject,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Access Denied");
  });

  it("AC-27: member with roleLimited displays tooltip Limited by their workspace role", async () => {
    const limitedMember: ProjectMemberResponse = {
      userId: "u-binh",
      firstName: "Binh",
      lastName: "Le",
      displayName: "binhle",
      avatarUrl: null,
      role: "viewer",
      assignedRole: "contributor",
      roleLimited: true,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: true,
    };

    renderMembersApp({
      membersResponse: {
        members: [limitedMember],
        total: 1,
        truncated: false,
        addableRoles: [],
      },
    });

    expect(await screen.findByText("Binh Le")).toBeInTheDocument();
    const tooltipTrigger = screen.getByLabelText(ROLE_LIMITED_TOOLTIP);
    expect(tooltipTrigger).toBeInTheDocument();
    expect(tooltipTrigger).toHaveAttribute("tabIndex", "0");
    tooltipTrigger.focus();
    expect(tooltipTrigger).toHaveFocus();
  });

  it("AC-28: deactivated member shows Deactivated badge and is counted in total", async () => {
    const deactivatedMember: ProjectMemberResponse = {
      userId: "u-dung",
      firstName: "Dung",
      lastName: "Tran",
      displayName: "dungtran",
      avatarUrl: null,
      role: "contributor",
      assignedRole: "contributor",
      roleLimited: false,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: false,
    };

    renderMembersApp({
      membersResponse: {
        members: [deactivatedMember],
        total: 1,
        truncated: false,
        addableRoles: [],
      },
    });

    expect(await screen.findByText("Dung Tran")).toBeInTheDocument();
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
  });

  it("AC-36: document title is Members · The First Project settings", async () => {
    renderMembersApp();

    await waitFor(() => {
      expect(document.title).toBe("Members · The First Project settings");
    });
  });

  it("AC-38: displays truncation alert when total exceeds max", async () => {
    renderMembersApp({
      membersResponse: {
        members: [memberKai],
        total: 1001,
        truncated: true,
        addableRoles: [],
      },
    });

    expect(
      await screen.findByText("Showing the first 1,000 of 1,001 members."),
    ).toBeInTheDocument();
  });

  it("AC-39: displays No members yet and Add member button when total is 0 and canAddMember is true", async () => {
    const user = userEvent.setup();
    renderMembersApp({
      membersResponse: {
        members: [],
        total: 0,
        truncated: false,
        addableRoles: ["admin", "contributor"],
      },
    });

    expect(await screen.findByText(NO_MEMBERS_YET)).toBeInTheDocument();
    expect(
      screen.queryByText("No members match your search"),
    ).not.toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: /^add member$/i });
    expect(addBtn).toBeInTheDocument();

    // Clicking Add member opens modal
    await user.click(addBtn);
    expect(
      await screen.findByRole("dialog", { name: "Add member" }),
    ).toBeInTheDocument();
  });

  it("successfully adds members, updates table, updates count, shows toast, and clears candidate cache (AC-12, AC-44)", async () => {
    const user = userEvent.setup();
    const candidateAn = {
      userId: "u-an",
      firstName: "An",
      lastName: "Nguyen",
      displayName: "An Nguyen",
      email: "an@openplany.dev",
      avatarUrl: null,
      status: "addable" as const,
      addableRoles: [
        "contributor" as const,
        "commenter" as const,
        "viewer" as const,
      ],
    };

    let searchCallCount = 0;

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [baseWorkspace],
          lastWorkspaceSlug: "the-firsts",
        }),
      "GET /api/workspaces/the-firsts": () => jsonResponse(200, baseWorkspace),
      "GET /api/workspaces/the-firsts/projects/TFP11": () =>
        jsonResponse(200, { project: sampleProject }),
      "GET /api/workspaces/the-firsts/projects/TFP11/members": () =>
        jsonResponse(200, {
          members: [memberKai],
          total: 1,
          truncated: false,
          addableRoles: ["admin", "contributor", "commenter", "viewer"],
        }),
      "GET /api/workspaces/the-firsts/projects/TFP11/member-candidates": () => {
        searchCallCount += 1;
        if (searchCallCount === 1) {
          return jsonResponse(200, { candidates: [candidateAn] });
        }
        // Second search after add (AC-44): candidate now already_member!
        return jsonResponse(200, {
          candidates: [
            { ...candidateAn, status: "already_member", addableRoles: [] },
          ],
        });
      },
      "POST /api/workspaces/the-firsts/projects/TFP11/members": () =>
        jsonResponse(201, {
          members: [
            {
              userId: "u-an",
              firstName: "An",
              lastName: "Nguyen",
              displayName: "An Nguyen",
              email: "an@openplany.dev",
              avatarUrl: null,
              role: "contributor",
              assignedRole: "contributor",
              roleLimited: false,
              joinedAt: "2026-10-13T10:00:00.000Z",
              accountActive: true,
            },
          ],
          project: {
            ...sampleProject,
            memberCount: 2,
          },
        }),
    });

    const router = createMemoryRouter(appRoutes, {
      initialEntries: ["/the-firsts/projects/TFP11/settings/members"],
    });

    render(
      <AppUiProvider>
        <Notifications />
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppUiProvider>,
    );

    // Initial page shows Kai Tran
    expect(await screen.findByText("Kai Tran")).toBeInTheDocument();

    // Click Add member
    const openModalBtn = screen.getByRole("button", { name: /^add member$/i });
    await user.click(openModalBtn);

    // Modal opens
    const modal = await screen.findByRole("dialog", { name: "Add member" });
    expect(modal).toBeInTheDocument();

    // Search for An
    const emailInput = screen.getByRole("textbox", { name: "Email" });
    await user.type(emailInput, "an@");

    await waitFor(() => {
      expect(screen.getByText("an@openplany.dev")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("option", { name: /an@openplany\.dev/i }),
    );

    // Submit modal
    const submitBtn = within(modal).getByRole("button", { name: "Add member" });
    await user.click(submitBtn);

    // Modal closes
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Add member" }),
      ).not.toBeInTheDocument();
    });

    // Toast appears
    expect(await screen.findByText("Added 1 member")).toBeInTheDocument();

    // Table now has An Nguyen
    expect(
      within(screen.getByRole("table")).getByText("an@openplany.dev"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getAllByText("An Nguyen").length,
    ).toBeGreaterThanOrEqual(1);

    // AC-44: Reopen modal and search An again -> candidate query was cleared, calls API again and shows "Already in this project"
    await user.click(screen.getByRole("button", { name: /^add member$/i }));
    const modalAgain = await screen.findByRole("dialog", {
      name: "Add member",
    });
    expect(modalAgain).toBeInTheDocument();

    const emailInputAgain = within(modalAgain).getByRole("textbox", {
      name: "Email",
    });
    await user.type(emailInputAgain, "an@");

    await waitFor(() => {
      expect(screen.getByText("Already in this project")).toBeInTheDocument();
    });
  });
});
