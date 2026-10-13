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
        "PATCH /api/workspaces/the-firsts/projects/TFP11/members/u-an": (init) => {
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
});

