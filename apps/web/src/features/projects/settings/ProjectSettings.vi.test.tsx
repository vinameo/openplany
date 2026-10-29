import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { setLanguage } from "../../../i18n";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeWorkspace } from "../../workspaces/test/workspaceFixtures";
import { CurrentWorkspaceContext } from "../../workspaces/currentWorkspace/currentWorkspaceContext";
import { CreateProjectModal } from "../create/CreateProjectModal";
import type { ProjectListItem, ProjectMemberResponse } from "@repo/contracts";

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

describe("ProjectSettings and Members in Vietnamese (Ticket 08)", () => {
  beforeEach(() => {
    setLanguage("vi");
  });

  afterEach(() => {
    cleanup();
    notifications.clean();
    setLanguage("en");
  });

  const baseWorkspace = makeWorkspace({
    id: "ws-1",
    slug: "acme-corp",
    name: "Acme Corp",
    timezone: "Asia/Ho_Chi_Minh",
    role: "admin",
    permissions: [
      "workspace.projects.create",
      "workspace.projects.delete",
      "workspace.members.view",
    ],
  });

  const sampleProject: ProjectListItem = {
    id: "p-101",
    name: "Core Platform",
    identifier: "CORE",
    description: "Core infra platform",
    icon: { name: "layers", color: "#228be6" },
    coverKey: "cover-01",
    role: "admin",
    timezone: null,
    effectiveTimezone: "Asia/Ho_Chi_Minh",
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-01T10:00:00Z",
    members: [],
    memberCount: 2,
    permissions: [
      "project.settings.view",
      "project.settings.update",
      "project.members.view",
      "project.members.manage",
    ],
  };

  it("INV-12, AC-13: renders project settings sidebar and navigation in Vietnamese while preserving 'Project ID', 'Workspace', and role names", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [baseWorkspace],
          lastWorkspaceSlug: baseWorkspace.slug,
        }),
      "GET /api/workspaces/acme-corp": () => jsonResponse(200, baseWorkspace),
      "GET /api/workspaces/acme-corp/projects/CORE": () =>
        jsonResponse(200, { project: sampleProject }),
      "GET /api/workspaces/acme-corp/projects": () =>
        jsonResponse(200, { projects: [sampleProject], total: 1 }),
    });

    renderApp("/acme-corp/projects/CORE/settings/general");

    // Back to project link in Vietnamese (INV-12)
    const backLinks = await screen.findAllByRole("link", {
      name: "Quay lại dự án",
    });
    expect(backLinks[0]).toHaveAttribute("href", "/acme-corp/projects/CORE");

    // Group heading and section links
    const headings = await screen.findAllByRole("heading", {
      name: "Cài đặt dự án",
    });
    expect(headings.length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Tổng quan" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Thành viên" }),
    ).toBeInTheDocument();

    // Project ID label and tooltip preserve "Project ID" (RQ A6, INV-12)
    expect(screen.getByText("Project ID")).toBeInTheDocument();

    // Submit button in Vietnamese
    expect(
      screen.getByRole("button", { name: "Cập nhật dự án" }),
    ).toBeInTheDocument();

    // Role name is preserved in English (INV-12)
    expect(screen.getByText("Project Admin")).toBeInTheDocument();
  });

  it("INV-08, AC-06, WEB B7: create project form maps 409 conflict to Vietnamese error under name input", async () => {
    const user = userEvent.setup();

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [baseWorkspace],
          lastWorkspaceSlug: baseWorkspace.slug,
        }),
      "GET /api/workspaces/acme-corp": () => jsonResponse(200, baseWorkspace),
      "POST /api/workspaces/acme-corp/projects": () =>
        jsonResponse(409, {
          statusCode: 409,
          error: "Conflict",
          code: "PROJECT_NAME_TAKEN",
          message: "Một dự án với tên này đã tồn tại",
          fields: { name: "Một dự án với tên này đã tồn tại" },
        }),
    });

    render(
      <AppUiProvider>
        <Notifications />
        <AuthProvider>
          <CurrentWorkspaceContext.Provider
            value={{
              workspace: baseWorkspace,
              applyWorkspaceUpdate: () => {},
              reload: async () => {},
            }}
          >
            <CreateProjectModal
              opened={true}
              onClose={() => {}}
              slug="acme-corp"
              onCreated={() => {}}
            />
          </CurrentWorkspaceContext.Provider>
        </AuthProvider>
      </AppUiProvider>,
    );

    // Modal title in Vietnamese
    expect(
      await screen.findByRole("heading", { name: "Tạo dự án" }),
    ).toBeInTheDocument();

    // Type name
    const nameInput = screen.getByLabelText("Tên dự án");
    await user.type(nameInput, "Existing Project");

    // Submit
    const submitBtn = screen.getByRole("button", { name: "Tạo dự án" });
    await user.click(submitBtn);

    // Error under input is in Vietnamese (INV-08, AC-06)
    expect(
      await screen.findByText("Một dự án với tên này đã tồn tại"),
    ).toBeInTheDocument();
  });

  it("INV-12, AC-13, INV-13, AC-20: members table preserves role names, renders 'Đã vô hiệu hoá' badge, and role change modal unescapes name", async () => {
    const user = userEvent.setup();

    const inheritedAdmin: ProjectMemberResponse = {
      userId: "u-admin",
      firstName: "Admin",
      lastName: "User",
      displayName: "admin",
      email: "admin@acme.com",
      avatarUrl: null,
      role: "admin",
      assignedRole: null,
      joinedAt: "2026-03-01T00:00:00Z",
      source: "inherited",
      workspaceRole: "admin",
      accountActive: true,
      roleLimited: false,
      assignableRoles: [],
    };

    const regularMember: ProjectMemberResponse = {
      userId: "u-reg",
      firstName: "Tom &",
      lastName: "Jerry",
      displayName: "tomjerry",
      email: "tom-jerry@acme.com",
      avatarUrl: null,
      role: "commenter",
      assignedRole: "commenter",
      joinedAt: "2026-03-02T00:00:00Z",
      source: "assigned",
      workspaceRole: "member",
      accountActive: true,
      roleLimited: false,
      assignableRoles: ["admin", "contributor", "commenter", "viewer"],
    };

    const deactivatedMember: ProjectMemberResponse = {
      userId: "u-deact",
      firstName: "Old",
      lastName: "Staff",
      displayName: "oldstaff",
      email: "old@acme.com",
      avatarUrl: null,
      role: "viewer",
      assignedRole: "viewer",
      joinedAt: "2026-03-01T00:00:00Z",
      source: "assigned",
      workspaceRole: "member",
      accountActive: false,
      roleLimited: false,
      assignableRoles: [],
    };

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [baseWorkspace],
          lastWorkspaceSlug: baseWorkspace.slug,
        }),
      "GET /api/workspaces/acme-corp": () => jsonResponse(200, baseWorkspace),
      "GET /api/workspaces/acme-corp/projects": () =>
        jsonResponse(200, { projects: [sampleProject], total: 1 }),
      "GET /api/workspaces/acme-corp/projects/CORE": () =>
        jsonResponse(200, { project: sampleProject }),
      "GET /api/workspaces/acme-corp/projects/CORE/members": () =>
        jsonResponse(200, {
          members: [inheritedAdmin, regularMember, deactivatedMember],
          total: 3,
          inheritedCount: 1,
          assignedAdminCount: 1,
          truncated: false,
          addableRoles: ["admin", "contributor", "commenter", "viewer"],
        }),
    });

    renderApp("/acme-corp/projects/CORE/settings/members");

    // Table headers in Vietnamese (INV-12)
    expect(await screen.findByText("Họ và tên")).toBeInTheDocument();
    expect(screen.getByText("Tên hiển thị")).toBeInTheDocument();
    expect(screen.getByText("Vai trò")).toBeInTheDocument();
    expect(screen.getByText("Ngày tham gia")).toBeInTheDocument();

    // Deactivated badge in Vietnamese (INV-12, AC-13)
    expect(screen.getByText("Đã vô hiệu hoá")).toBeInTheDocument();

    // Inherited member renders "Workspace Admin" badge (preserving term)
    expect(screen.getByText("Workspace Admin")).toBeInTheDocument();

    // Regular member has Commenter role
    expect(screen.getByText("Commenter")).toBeInTheDocument();

    // Click role select for Tom & Jerry to promote to admin
    const roleSelect = screen.getByRole("combobox", {
      name: "Vai trò của Tom & Jerry",
    });
    await user.click(roleSelect);

    // Click Project Admin option
    const adminOption = await screen.findByRole("option", {
      name: /Project Admin/,
    });
    await user.click(adminOption);

    // Modal opens: title preserves unescaped name with & (INV-13, AC-20)
    expect(
      await screen.findByRole("heading", {
        name: "Đặt Tom & Jerry làm Project Admin?",
      }),
    ).toBeInTheDocument();

    // Confirm button in Vietnamese
    expect(
      screen.getByRole("button", { name: "Đặt làm Project Admin" }),
    ).toBeInTheDocument();
  });
});
