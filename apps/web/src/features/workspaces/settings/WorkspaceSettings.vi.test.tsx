import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { setLanguage } from "../../../i18n";
import { ApiRequestError } from "../../../lib/apiClient";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeWorkspace } from "../test/workspaceFixtures";
import { submitAddMembers } from "../../members/submitAddMembers";

function renderApp(initialPath: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  const view = render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router, ...view };
}

describe("WorkspaceSettings and Members in Vietnamese (Ticket 07)", () => {
  beforeEach(() => {
    setLanguage("vi");
  });

  afterEach(() => {
    notifications.clean();
    setLanguage("en");
  });

  it("INV-12, INV-15: renders settings sidebar and navigation in Vietnamese while preserving 'Workspace'", async () => {
    const ws = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      permissions: ["workspace.settings.update", "workspace.members.view"],
    });

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy/settings/general");

    const headings = await screen.findAllByRole("heading", {
      name: "Cài đặt Workspace",
    });
    expect(headings.length).toBeGreaterThan(0);

    const backButtons = screen.getAllByRole("link", {
      name: "Quay lại Workspace",
    });
    expect(backButtons[0]).toHaveAttribute("href", "/openstudy");

    // Group and section navigation labels resolved at render time from keys (INV-15)
    expect(
      screen.getByRole("heading", { name: "Quản trị" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chung" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thành viên" })).toBeInTheDocument();
  });

  it("INV-16, AC-18: general settings form renders in vi and submits canonical organization size", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({
      id: "ws-1",
      slug: "openstudy",
      name: "OpenStudy",
      organizationSize: "2-10",
      timezone: "UTC",
      role: "admin",
      permissions: ["workspace.settings.update"],
    });

    let patchCalledWith: Record<string, unknown> = {};
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
      "PATCH /api/workspaces/openstudy": (init) => {
        patchCalledWith = JSON.parse((init?.body as string) ?? "{}") as Record<
          string,
          unknown
        >;
        return jsonResponse(200, {
          ...ws,
          ...patchCalledWith,
          updatedAt: new Date().toISOString(),
        });
      },
    });

    renderApp("/openstudy/settings/general");

    // Vietnamese form labels
    expect(
      await screen.findByRole("textbox", { name: "Tên Workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Quy mô công ty")).toBeInTheDocument();
    expect(screen.getByText("Múi giờ Workspace")).toBeInTheDocument();
    expect(screen.getByText("URL Workspace")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Cập nhật Workspace" });
    expect(submitBtn).toBeDisabled();

    // Change company size: select option with canonical value 11-50
    const sizeInput = screen.getByRole("combobox", { name: "Quy mô công ty" });
    await user.click(sizeInput);
    const option = await screen.findByRole("option", { name: "11-50" });
    await user.click(option);

    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchCalledWith).toEqual({ organizationSize: "11-50" });
    });

    expect(await screen.findByText("Đã cập nhật Workspace")).toBeInTheDocument();
  });

  it("RQ A6, WEB B6: members settings page renders localized headers, 'Đã vô hiệu hoá' badge, and formatted numbers", async () => {
    const ws = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      role: "admin",
      permissions: ["workspace.members.view", "workspace.members.email.view"],
    });

    const members = [
      {
        userId: "u-1",
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "an@openplany.dev",
        role: "admin" as const,
        joinedAt: "2026-03-01T00:00:00.000Z",
        accountActive: true,
      },
      {
        userId: "u-2",
        firstName: "Binh",
        lastName: "Tran",
        displayName: "Binh Tran",
        email: "binh@openplany.dev",
        role: "member" as const,
        joinedAt: "2026-03-02T00:00:00.000Z",
        accountActive: false, // deactivated
      },
    ];

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
      "GET /api/workspaces/openstudy/members": () =>
        jsonResponse(200, {
          members,
          total: 5000,
          truncated: true,
          addableRoles: ["admin", "member"],
        }),
    });

    renderApp("/openstudy/settings/members");

    // Title and table headers localized to Vietnamese
    expect(await screen.findByRole("heading", { name: "Thành viên" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Họ và tên/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Tên hiển thị/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Email/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Vai trò/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Ngày tham gia/i })).toBeInTheDocument();

    // Deactivated account shows Vietnamese badge "Đã vô hiệu hoá" (RQ A6, D8)
    expect(screen.getByText("Đã vô hiệu hoá")).toBeInTheDocument();

    // Number formatting in Vietnamese uses period as thousands separator: 1.000 of 5.000 (WEB B6)
    expect(
      screen.getByText("Đang hiện 1.000 trên tổng số 5.000 thành viên."),
    ).toBeInTheDocument();
  });

  it("INV-13, AC-20: role change modal preserves special name characters without HTML escaping", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      role: "admin",
      permissions: ["workspace.members.view", "workspace.members.role.update"],
    });

    const specialMember = {
      userId: "u-special",
      firstName: "R&D",
      lastName: "<Team>",
      displayName: "R&D <Team>",
      email: "rd@openplany.dev",
      role: "member" as const,
      joinedAt: "2026-03-01T00:00:00.000Z",
      accountActive: true,
      assignableRoles: ["member" as const, "admin" as const],
    };

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
      "GET /api/workspaces/openstudy/members": () =>
        jsonResponse(200, {
          members: [specialMember],
          total: 1,
          truncated: false,
          addableRoles: ["admin", "member"],
        }),
      "GET /api/workspaces/openstudy/members/u-special/role-change-preview?toRole=admin":
        () =>
          jsonResponse(200, {
            fromRole: "member",
            toRole: "admin",
            effect: "gain_implicit",
            affectedProjects: { projects: [], total: 0, hiddenCount: 0 },
            projectsLosingAssignedAdmin: { projects: [], total: 0, hiddenCount: 0 },
            actorCanChooseProjectRole: false,
            projectRoleChoices: [],
            defaultProjectRole: null,
          }),
    });

    renderApp("/openstudy/settings/members");

    // Open role change modal
    const roleSelect = await screen.findByRole("combobox", {
      name: "Vai trò của R&D <Team>",
    });
    await user.click(roleSelect);
    const adminOption = await screen.findByRole("option", { name: "Admin" });
    await user.click(adminOption);

    // Modal title contains the unescaped name
    const modalHeading = await screen.findByRole("heading", {
      name: "Đổi vai trò của R&D <Team> thành Workspace Admin?",
    });
    expect(modalHeading).toBeInTheDocument();

    // Confirm button in vi
    expect(
      screen.getByRole("button", { name: "Đổi thành Workspace Admin" }),
    ).toBeInTheDocument();
  });

  it("AC-21: submitAddMembers maps 403 ROLE_NOT_ALLOWED to 'Bạn không thể gán vai trò này'", async () => {
    const showSpy = vi.spyOn(notifications, "show");
    const outcome = await submitAddMembers({
      send: () =>
        Promise.reject(
          new ApiRequestError(403, {
            code: "ROLE_NOT_ALLOWED",
            message: "You cannot assign this role",
          }),
        ),
      rowIdByIndex: ["row-1"],
      afterAdded: vi.fn(),
      refreshAfterLostAccess: vi.fn(),
      logContext: "test.vi.add",
    });

    expect(outcome).toEqual({ kind: "done" });
    expect(showSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "red",
        message: "Bạn không thể gán vai trò này",
      }),
    );
  });

  it("displays alert when there is no active Admin in Vietnamese", async () => {
    const ws = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      role: "admin",
      permissions: ["workspace.members.view"],
    });

    const inactiveAdmin = {
      userId: "u-admin",
      firstName: "Admin",
      lastName: "User",
      displayName: "Admin User",
      email: "admin@openplany.dev",
      role: "admin" as const,
      joinedAt: "2026-03-01T00:00:00.000Z",
      accountActive: false, // inactive
    };

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
      "GET /api/workspaces/openstudy/members": () =>
        jsonResponse(200, {
          members: [inactiveAdmin],
          total: 1,
          truncated: false,
          addableRoles: [],
        }),
    });

    renderApp("/openstudy/settings/members");

    expect(
      await screen.findByText(
        "Không có Admin nào đang hoạt động. Hãy yêu cầu quản trị viên hệ thống trợ giúp.",
      ),
    ).toBeInTheDocument();
  });
});
