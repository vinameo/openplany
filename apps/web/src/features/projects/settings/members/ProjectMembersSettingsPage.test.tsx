import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import {
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  type ProjectListItem,
  type ProjectMemberListResponse,
  type ProjectMemberResponse,
} from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../../routes";
import { makeSession } from "../../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { AuthProvider } from "../../../auth/AuthProvider";
import { makeWorkspace } from "../../../workspaces/test/workspaceFixtures";
import { tooManyAttemptsMessage } from "../../../members/membersMessages";
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
    assignedAdminCount: 2,
  },
  extraRoutes = {},
}: {
  initialEntries?: string[];
  project?: ProjectListItem;
  workspace?: ReturnType<typeof makeWorkspace>;
  membersResponse?: ProjectMemberListResponse;
  extraRoutes?: Record<
    string,
    (init?: RequestInit) => Response | Promise<Response>
  >;
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
    ...extraRoutes,
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
  notifications.clean();
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
    source: "assigned",
    workspaceRole: "member",
    assignableRoles: [],
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
    source: "assigned",
    workspaceRole: "member",
    assignableRoles: [],
  };

  it("AC-01: Nam without email view permission sees members table, NO note, NO email column, and sees Add member button", async () => {
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
      assignedAdminCount: 2,
    };

    renderMembersApp({
      workspace: workspaceNam,
      membersResponse: membersData,
    });

    expect(await screen.findByText("Kai Tran")).toBeInTheDocument();
    expect(screen.getByText("Nam Nguyen")).toBeInTheDocument();
    expect(screen.queryByText(WORKSPACE_ADMINS_NOTE)).not.toBeInTheDocument();

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
      assignedAdminCount: 2,
    };

    renderMembersApp({
      membersResponse: membersData,
    });

    expect(await screen.findByText("Kai Tran")).toBeInTheDocument();
    expect(screen.queryByText(WORKSPACE_ADMINS_NOTE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^add member$/i }),
    ).not.toBeInTheDocument();
  });

  it("AC-12: Inherited member renders Workspace Admin badge with tooltip and Joining date dash", async () => {
    const inheritedKai: ProjectMemberResponse = {
      userId: "u-kai-admin",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "kaitran",
      email: "kai@openplany.dev",
      avatarUrl: null,
      role: "admin",
      assignedRole: null,
      roleLimited: false,
      joinedAt: null,
      accountActive: true,
      source: "inherited",
      workspaceRole: "admin",
      assignableRoles: [],
    };

    const membersData: ProjectMemberListResponse = {
      members: [inheritedKai],
      total: 1,
      truncated: false,
      addableRoles: ["admin", "contributor", "commenter", "viewer"],
      assignedAdminCount: 0,
    };

    renderMembersApp({
      membersResponse: membersData,
    });

    expect(await screen.findByText("Kai Tran")).toBeInTheDocument();

    // Badge Workspace Admin exists
    const badge = screen.getByText("Workspace Admin");
    expect(badge).toBeInTheDocument();

    // Joining date dash with accessible text
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Not added to this project")).toBeInTheDocument();
  });

  it("AC-03: Kai with email view permission sees Email column with full email addresses", async () => {
    const membersData: ProjectMemberListResponse = {
      members: [memberKai, memberNam],
      total: 2,
      truncated: false,
      addableRoles: ["admin", "contributor", "commenter", "viewer"],
      assignedAdminCount: 2,
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
      source: "assigned",
      workspaceRole: "guest",
      assignableRoles: [],
    };

    renderMembersApp({
      membersResponse: {
        members: [limitedMember],
        total: 1,
        truncated: false,
        addableRoles: [],
        assignedAdminCount: 0,
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
      source: "assigned",
      workspaceRole: "member",
      assignableRoles: [],
    };

    renderMembersApp({
      membersResponse: {
        members: [deactivatedMember],
        total: 1,
        truncated: false,
        addableRoles: [],
        assignedAdminCount: 0,
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
        assignedAdminCount: 1,
      },
    });

    expect(
      await screen.findByText(
        "Showing the first 1,000 of 1,001 project members.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-04: payload with inherited and truncated assigned members renders total badge and project members truncation alert", async () => {
    const inheritedAdmin1: ProjectMemberResponse = {
      ...memberKai,
      userId: "u-admin-1",
      source: "inherited",
      role: "admin",
      workspaceRole: "admin",
      assignedRole: null,
      joinedAt: null,
      assignableRoles: [],
    };
    renderMembersApp({
      membersResponse: {
        members: [inheritedAdmin1, memberNam],
        total: 1005,
        truncated: true,
        addableRoles: [],
        assignedAdminCount: 0,
      },
    });

    expect(
      await screen.findByText(
        "Showing the first 1,000 of 1,005 project members.",
      ),
    ).toBeInTheDocument();
    // Badge shows total (1005), not members.length (2)
    expect(screen.getByText("1005")).toBeInTheDocument();
  });

  it("AC-39: displays No members yet and Add member button when total is 0 and canAddMember is true", async () => {
    const user = userEvent.setup();
    renderMembersApp({
      membersResponse: {
        members: [],
        total: 0,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 0,
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

  const memberAn: ProjectMemberResponse = {
    userId: "u-an",
    firstName: "An",
    lastName: "Nguyen",
    displayName: "annguyen",
    email: "an@openplany.dev",
    avatarUrl: null,
    role: "commenter",
    assignedRole: "commenter",
    roleLimited: false,
    joinedAt: "2026-10-12T10:00:00.000Z",
    accountActive: true,
    source: "assigned",
    workspaceRole: "member",
    assignableRoles: ["admin", "contributor", "commenter"],
  };

  const memberBinh: ProjectMemberResponse = {
    userId: "u-binh",
    firstName: "Binh",
    lastName: "Le",
    displayName: "binhle",
    email: "binh@openplany.dev",
    avatarUrl: null,
    role: "contributor",
    assignedRole: "contributor",
    roleLimited: false,
    joinedAt: "2026-10-12T10:00:00.000Z",
    accountActive: true,
    source: "assigned",
    workspaceRole: "member",
    assignableRoles: ["contributor", "commenter"],
  };

  it("Feature 15 AC-01: selects Contributor for Commenter row -> sends PATCH, displays toast, cell displays new role", async () => {
    const user = userEvent.setup();
    let patchPayload: unknown = null;

    renderMembersApp({
      membersResponse: {
        members: [memberKai, memberAn],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor", "commenter", "viewer"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": (
          init,
        ) => {
          patchPayload = JSON.parse(init?.body as string);
          return jsonResponse(200, {
            member: {
              ...memberAn,
              role: "contributor",
              assignedRole: "contributor",
            },
            assignedAdminCount: 2,
          });
        },
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(anSelect).toHaveValue("Commenter");

    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    await waitFor(() => {
      expect(patchPayload).toEqual({
        fromRole: "commenter",
        role: "contributor",
      });
    });

    expect(
      await screen.findByText(
        "An Nguyen is now Contributor in The First Project.",
      ),
    ).toBeInTheDocument();
    expect(anSelect).toHaveValue("Contributor");
  });

  it("Feature 15 AC-02: role select cell only renders when there is > 1 option allowed; inherited row displays badge Workspace Admin and text cannot be changed", async () => {
    const inheritedKai: ProjectMemberResponse = {
      userId: "u-kai-admin",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "kaitran",
      email: "kai@openplany.dev",
      avatarUrl: null,
      role: "admin",
      assignedRole: null,
      roleLimited: false,
      joinedAt: null,
      accountActive: true,
      source: "inherited",
      workspaceRole: "admin",
      assignableRoles: [],
    };

    renderMembersApp({
      membersResponse: {
        members: [inheritedKai, memberNam],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 1,
      },
    });

    expect(await screen.findByText("Kai Tran")).toBeInTheDocument();
    expect(screen.getByText("Nam Nguyen")).toBeInTheDocument();

    // Inherited Kai has Workspace Admin badge and no combobox
    expect(screen.getByText("Workspace Admin")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Role for Kai Tran" }),
    ).not.toBeInTheDocument();

    // Nam is admin with assignableRoles: [] (length <= 1) -> no combobox
    expect(
      screen.queryByRole("combobox", { name: "Role for Nam Nguyen" }),
    ).not.toBeInTheDocument();
    // Nam displays text Project Admin in the row
    const namRow = screen.getByText("Nam Nguyen").closest("tr")!;
    expect(within(namRow).getByText("Project Admin")).toBeInTheDocument();
  });

  it("Feature 15 AC-16: successful role change updates row and assignedAdminCount without re-fetching members list", async () => {
    const user = userEvent.setup();
    let membersCallCount = 0;

    renderMembersApp({
      membersResponse: {
        members: [memberAn],
        total: 1,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/members": () => {
          membersCallCount += 1;
          return jsonResponse(200, {
            members: [memberAn],
            total: 1,
            truncated: false,
            addableRoles: ["admin", "contributor"],
            assignedAdminCount: 2,
          });
        },
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          jsonResponse(200, {
            member: {
              ...memberAn,
              role: "contributor",
              assignedRole: "contributor",
            },
            assignedAdminCount: 2,
          }),
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(membersCallCount).toBe(1);
    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    await waitFor(() => {
      expect(anSelect).toHaveValue("Contributor");
    });

    // Members list was NOT re-fetched
    expect(membersCallCount).toBe(1);
  });

  it("Feature 15 AC-23: concurrent role changes on two rows locks each row independently and displays toasts for each", async () => {
    const user = userEvent.setup();

    let resolveAn: (res: Response) => void;
    const anPromise = new Promise<Response>((resolve) => {
      resolveAn = resolve;
    });

    let resolveBinh: (res: Response) => void;
    const binhPromise = new Promise<Response>((resolve) => {
      resolveBinh = resolve;
    });

    renderMembersApp({
      membersResponse: {
        members: [memberAn, memberBinh],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          anPromise,
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-binh": () =>
          binhPromise,
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    const binhSelect = screen.getByRole("combobox", {
      name: "Role for Binh Le",
    });

    // Both initially enabled
    expect(anSelect).not.toBeDisabled();
    expect(binhSelect).not.toBeDisabled();

    // Trigger An's change
    await user.click(anSelect);
    await user.click(
      await screen.findByRole("option", { name: /^contributor/i }),
    );

    // An is now disabled while pending, Binh is still enabled
    await waitFor(() => {
      expect(anSelect).toBeDisabled();
    });
    expect(binhSelect).not.toBeDisabled();

    // Trigger Binh's change
    await user.click(binhSelect);
    await user.click(
      await screen.findByRole("option", { name: /^commenter/i }),
    );

    // Both are now disabled
    await waitFor(() => {
      expect(binhSelect).toBeDisabled();
    });
    expect(anSelect).toBeDisabled();

    // Resolve An's request
    resolveAn!(
      jsonResponse(200, {
        member: {
          ...memberAn,
          role: "contributor",
          assignedRole: "contributor",
        },
        assignedAdminCount: 2,
      }),
    );

    // An becomes enabled and shows toast, Binh is still disabled
    await waitFor(() => {
      expect(anSelect).not.toBeDisabled();
    });
    expect(binhSelect).toBeDisabled();
    expect(
      screen.getByText("An Nguyen is now Contributor in The First Project."),
    ).toBeInTheDocument();

    // Resolve Binh's request
    resolveBinh!(
      jsonResponse(200, {
        member: {
          ...memberBinh,
          role: "commenter",
          assignedRole: "commenter",
        },
        assignedAdminCount: 2,
      }),
    );

    // Binh becomes enabled and shows toast
    await waitFor(() => {
      expect(binhSelect).not.toBeDisabled();
    });
    expect(
      screen.getByText("Binh Le is now Commenter in The First Project."),
    ).toBeInTheDocument();
  });

  it("Feature 15 AC-10: selecting Project Admin opens confirmation modal with D17 body; Cancel cancels, confirm PATCHes and updates role", async () => {
    const user = userEvent.setup();
    const memberKai: ProjectMemberResponse = {
      userId: "u-kai",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "kaitran",
      email: "kai@example.com",
      avatarUrl: null,
      role: "admin",
      assignedRole: "admin",
      roleLimited: false,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: true,
      source: "assigned",
      workspaceRole: "member",
      assignableRoles: [],
    };
    const memberAn: ProjectMemberResponse = {
      userId: "u-an",
      firstName: "An",
      lastName: "Nguyen",
      displayName: "annguyen",
      email: "an@example.com",
      avatarUrl: null,
      role: "commenter",
      assignedRole: "commenter",
      roleLimited: false,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: true,
      source: "assigned",
      workspaceRole: "member",
      assignableRoles: ["admin", "contributor", "commenter"],
    };

    let patchCalled = false;
    let patchPayload: unknown = null;

    renderMembersApp({
      membersResponse: {
        members: [memberKai, memberAn],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor", "commenter", "viewer"],
        assignedAdminCount: 1,
      },
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": (
          init,
        ) => {
          patchCalled = true;
          patchPayload = JSON.parse(init?.body as string);
          return jsonResponse(200, {
            member: {
              ...memberAn,
              role: "admin",
              assignedRole: "admin",
            },
            assignedAdminCount: 2,
          });
        },
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(anSelect).toHaveValue("Commenter");

    // Click on Project Admin option
    await user.click(anSelect);
    const adminOption = await screen.findByRole("option", {
      name: /^project admin/i,
    });
    await user.click(adminOption);

    // Modal opens
    const dialog = await screen.findByRole("dialog", {
      name: "Make An Nguyen a Project Admin?",
    });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Project Admins can manage this project's settings and members. After this, only Workspace Admins can change An Nguyen's role.",
      ),
    ).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    // Modal closed, PATCH not called, select still Commenter
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(patchCalled).toBe(false);
    expect(anSelect).toHaveValue("Commenter");

    // Open modal again and confirm
    await user.click(anSelect);
    const adminOption2 = await screen.findByRole("option", {
      name: /^project admin/i,
    });
    await user.click(adminOption2);

    const dialog2 = await screen.findByRole("dialog", {
      name: "Make An Nguyen a Project Admin?",
    });
    const confirmBtn = within(dialog2).getByRole("button", {
      name: "Make Project Admin",
    });
    await user.click(confirmBtn);

    // Modal closes, PATCH was called, toast shown, select updated
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(patchCalled).toBe(true);
    expect(patchPayload).toEqual({
      fromRole: "commenter",
      role: "admin",
    });
    expect(
      await screen.findByText(
        "An Nguyen is now Project Admin in The First Project.",
      ),
    ).toBeInTheDocument();
    expect(anSelect).toHaveValue("Project Admin");
  });

  it("Feature 15 AC-11 & AC-12: demoting Project Admin opens modal with red button; warns when assignedAdminCount = 1, does not warn when assignedAdminCount = 2, warns when other admin is deactivated", async () => {
    const user = userEvent.setup();
    const memberNam: ProjectMemberResponse = {
      userId: "u-nam",
      firstName: "Nam",
      lastName: "Tran",
      displayName: "namtran",
      email: "nam@example.com",
      avatarUrl: null,
      role: "admin",
      assignedRole: "admin",
      roleLimited: false,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: true,
      source: "assigned",
      workspaceRole: "member",
      assignableRoles: ["admin", "contributor", "commenter"],
    };

    // Case 1: assignedAdminCount = 1 -> shows last admin warning
    const { unmount } = renderMembersApp({
      membersResponse: {
        members: [memberNam],
        total: 1,
        truncated: false,
        addableRoles: ["admin", "contributor", "commenter", "viewer"],
        assignedAdminCount: 1,
      },
    });

    const namSelect = await screen.findByRole("combobox", {
      name: "Role for Nam Tran",
    });
    await user.click(namSelect);
    await user.click(
      await screen.findByRole("option", { name: /^contributor/i }),
    );

    const dialog1 = await screen.findByRole("dialog", {
      name: "Change Nam Tran's role to Contributor?",
    });
    expect(dialog1).toBeInTheDocument();
    expect(
      within(dialog1).getByText(
        "Nam Tran will no longer be able to manage this project's settings and members.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog1).getByText(
        "The First Project will have no Project Admin other than Workspace Admins.",
      ),
    ).toBeInTheDocument();
    const confirmBtn1 = within(dialog1).getByRole("button", {
      name: "Change to Contributor",
    });
    expect(confirmBtn1).toBeInTheDocument();
    // Cancel dialog 1
    await user.click(within(dialog1).getByRole("button", { name: "Cancel" }));
    unmount();

    // Case 2: assignedAdminCount = 2 -> NO warning
    const memberNam2 = { ...memberNam };
    const { unmount: unmount2 } = renderMembersApp({
      membersResponse: {
        members: [memberNam2],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor", "commenter", "viewer"],
        assignedAdminCount: 2,
      },
    });

    const namSelect2 = await screen.findByRole("combobox", {
      name: "Role for Nam Tran",
    });
    await user.click(namSelect2);
    await user.click(
      await screen.findByRole("option", { name: /^contributor/i }),
    );

    const dialog2 = await screen.findByRole("dialog", {
      name: "Change Nam Tran's role to Contributor?",
    });
    expect(dialog2).toBeInTheDocument();
    expect(
      within(dialog2).queryByText(
        "The First Project will have no Project Admin other than Workspace Admins.",
      ),
    ).not.toBeInTheDocument();
    await user.click(within(dialog2).getByRole("button", { name: "Cancel" }));
    unmount2();

    // Case 3: 2 project admins in list but one is deactivated -> assignedAdminCount = 1 -> STILL warns
    const memberOtherDeactivated: ProjectMemberResponse = {
      userId: "u-deact",
      firstName: "Deact",
      lastName: "User",
      displayName: "deactuser",
      email: "deact@example.com",
      avatarUrl: null,
      role: "admin",
      assignedRole: "admin",
      roleLimited: false,
      joinedAt: "2026-10-12T10:00:00.000Z",
      accountActive: false,
      source: "assigned",
      workspaceRole: "member",
      assignableRoles: [],
    };
    renderMembersApp({
      membersResponse: {
        members: [memberNam, memberOtherDeactivated],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor", "commenter", "viewer"],
        assignedAdminCount: 1, // Only Nam is active
      },
    });

    const namSelect3 = await screen.findByRole("combobox", {
      name: "Role for Nam Tran",
    });
    await user.click(namSelect3);
    await user.click(
      await screen.findByRole("option", { name: /^contributor/i }),
    );

    const dialog3 = await screen.findByRole("dialog", {
      name: "Change Nam Tran's role to Contributor?",
    });
    expect(dialog3).toBeInTheDocument();
    expect(
      within(dialog3).getByText(
        "The First Project will have no Project Admin other than Workspace Admins.",
      ),
    ).toBeInTheDocument();
  });

  it("Feature 15 AC-13 & AC-14: inline change fails with 409 ROLE_CHANGED -> retains original role in cell, displays red alert toast, and re-fetches members list", async () => {
    const user = userEvent.setup();
    let membersFetchCount = 0;

    renderMembersApp({
      membersResponse: {
        members: [memberAn],
        total: 1,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/members": () => {
          membersFetchCount += 1;
          return jsonResponse(200, {
            members: [memberAn],
            total: 1,
            truncated: false,
            addableRoles: ["admin", "contributor"],
            assignedAdminCount: 2,
          });
        },
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          apiError(409, "ROLE_CHANGED", MEMBER_MESSAGES.roleChanged),
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(anSelect).toHaveValue("Commenter");
    expect(membersFetchCount).toBe(1);

    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    // Toast with roleChanged message and red alert
    expect(
      await screen.findByText(MEMBER_MESSAGES.roleChanged),
    ).toBeInTheDocument();

    // Select retains original value
    expect(anSelect).toHaveValue("Commenter");

    // Re-fetches members list (invalidates cache)
    await waitFor(() => {
      expect(membersFetchCount).toBe(2);
    });
  });

  it("Feature 15 AC-20: inline change fails with 429 TOO_MANY_ATTEMPTS -> displays rate limit message with retryAfterSeconds, retains original role in cell, does not reload", async () => {
    const user = userEvent.setup();
    let membersFetchCount = 0;

    renderMembersApp({
      membersResponse: {
        members: [memberAn],
        total: 1,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/members": () => {
          membersFetchCount += 1;
          return jsonResponse(200, {
            members: [memberAn],
            total: 1,
            truncated: false,
            addableRoles: ["admin", "contributor"],
            assignedAdminCount: 2,
          });
        },
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts", {
            retryAfterSeconds: 45,
          }),
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(anSelect).toHaveValue("Commenter");
    expect(membersFetchCount).toBe(1);

    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    // Toast with tooManyAttemptsMessage(45)
    expect(
      await screen.findByText(tooManyAttemptsMessage(45)),
    ).toBeInTheDocument();

    // Select retains original value
    expect(anSelect).toHaveValue("Commenter");

    // Does NOT reload
    expect(membersFetchCount).toBe(1);
  });

  it("Feature 15 AC-25: inline change fails with 404 PROJECT_NOT_FOUND -> displays project not found toast, triggers members reload", async () => {
    const user = userEvent.setup();
    let membersFetchCount = 0;

    renderMembersApp({
      membersResponse: {
        members: [memberAn],
        total: 1,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "GET /api/workspaces/the-firsts/projects/TFP11/members": () => {
          membersFetchCount += 1;
          return jsonResponse(200, {
            members: [memberAn],
            total: 1,
            truncated: false,
            addableRoles: ["admin", "contributor"],
            assignedAdminCount: 2,
          });
        },
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          apiError(404, "PROJECT_NOT_FOUND", PROJECT_ERROR_MESSAGES.notFound),
      },
    });

    const anSelect = await screen.findByRole("combobox", {
      name: "Role for An Nguyen",
    });
    expect(anSelect).toHaveValue("Commenter");

    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    // Toast with PROJECT_ERROR_MESSAGES.notFound
    expect(
      await screen.findByText(PROJECT_ERROR_MESSAGES.notFound),
    ).toBeInTheDocument();

    // Triggers reload
    await waitFor(() => {
      expect(membersFetchCount).toBeGreaterThanOrEqual(2);
    });
  });

  it("Feature 15 AC-24: when role filter is active and member's role change filters them out of view -> focus falls back to Filter by role button", async () => {
    const user = userEvent.setup();

    renderMembersApp({
      membersResponse: {
        members: [memberAn, memberBinh],
        total: 2,
        truncated: false,
        addableRoles: ["admin", "contributor"],
        assignedAdminCount: 2,
      },
      extraRoutes: {
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": () =>
          jsonResponse(200, {
            member: {
              ...memberAn,
              role: "contributor",
              assignedRole: "contributor",
            },
            assignedAdminCount: 2,
          }),
      },
    });

    // Wait for table to load
    expect(await screen.findByText("Binh Le")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Role for An Nguyen" }),
    ).toBeInTheDocument();

    // Click Filter by role button to open filter dropdown
    const filterBtn = screen.getByRole("button", { name: "Filter by role" });
    await user.click(filterBtn);

    // Select Commenter role in filter
    const commenterCheckbox = await screen.findByRole("checkbox", {
      name: "Commenter",
    });
    await user.click(commenterCheckbox);

    // Close the popover by pressing Escape
    await user.keyboard("{Escape}");

    // Now only An (Commenter) is in the table, Binh (Contributor) is filtered out
    expect(
      screen.getByRole("combobox", { name: "Role for An Nguyen" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Binh Le")).not.toBeInTheDocument();

    // Now change An's role to Contributor
    const anSelect = screen.getByRole("combobox", {
      name: "Role for An Nguyen",
    });
    await user.click(anSelect);
    const contribOption = await screen.findByRole("option", {
      name: /^contributor/i,
    });
    await user.click(contribOption);

    // Wait for An's row to be filtered out (since filter is Commenter)
    await waitFor(() => {
      expect(
        screen.queryByRole("combobox", { name: "Role for An Nguyen" }),
      ).not.toBeInTheDocument();
    });

    // Focus falls back to the Filter by role button
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Filter by role" }),
      ).toHaveFocus();
    });
  });
});
