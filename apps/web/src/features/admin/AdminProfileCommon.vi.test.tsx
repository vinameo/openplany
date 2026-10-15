import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en, vi as viCatalog } from "@repo/contracts";
import { appRoutes } from "../../routes";
import { makeSession } from "../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { setLanguage, translate } from "../../i18n";
import { AuthProvider } from "../auth/AuthProvider";
import { makeDefaultRolesResponse } from "./roles/test/rolesFixtures";
import { PERMISSION_GROUP_KEYS } from "./roles/permissionLabels";
import { ProfileModal } from "../profile/ProfileModal";
import { validateName } from "../profile/profileValidation";
import { GENERIC_PROFILE_ERROR_KEY } from "../profile/api/profileApi";
import {
  GENERIC_LOAD_ROLES_ERROR_KEY,
  GENERIC_UPDATE_ROLES_ERROR_KEY,
} from "./roles/api/adminRolesApi";
import { GENERIC_CREATE_USER_ERROR_KEY } from "./users/api/adminUsersApi";

// Database permissions (47 rows in DB, DB B2)
const DB_PERMISSIONS: {
  key: string;
  scope: "workspace" | "project";
  label: string;
}[] = [
  {
    key: "workspace.settings.view",
    scope: "workspace",
    label: "View workspace settings",
  },
  {
    key: "workspace.settings.update",
    scope: "workspace",
    label: "Edit workspace settings",
  },
  { key: "workspace.delete", scope: "workspace", label: "Delete workspace" },
  {
    key: "workspace.members.view",
    scope: "workspace",
    label: "View workspace members",
  },
  {
    key: "workspace.members.email.view",
    scope: "workspace",
    label: "View member emails",
  },
  { key: "workspace.members.add", scope: "workspace", label: "Add members" },
  {
    key: "workspace.members.remove",
    scope: "workspace",
    label: "Remove members",
  },
  {
    key: "workspace.members.role.update",
    scope: "workspace",
    label: "Change member roles",
  },
  {
    key: "workspace.members.history.view",
    scope: "workspace",
    label: "View member history",
  },
  {
    key: "workspace.projects.create",
    scope: "workspace",
    label: "Create projects",
  },
  {
    key: "workspace.projects.browse",
    scope: "workspace",
    label: "Browse projects",
  },
  {
    key: "workspace.projects.delete",
    scope: "workspace",
    label: "Delete projects",
  },
  {
    key: "project.settings.view",
    scope: "project",
    label: "View project settings",
  },
  {
    key: "project.settings.update",
    scope: "project",
    label: "Edit project settings",
  },
  { key: "project.archive", scope: "project", label: "Archive project" },
  {
    key: "project.members.view",
    scope: "project",
    label: "View project members",
  },
  {
    key: "project.members.manage",
    scope: "project",
    label: "Manage project members",
  },
  { key: "project.workitems.view", scope: "project", label: "View work items" },
  {
    key: "project.workitems.create",
    scope: "project",
    label: "Create work items",
  },
  {
    key: "project.workitems.update.any",
    scope: "project",
    label: "Edit any work items",
  },
  {
    key: "project.workitems.delete.any",
    scope: "project",
    label: "Delete any work items",
  },
  {
    key: "project.workitems.delete.own",
    scope: "project",
    label: "Delete own work items",
  },
  { key: "project.comments.create", scope: "project", label: "Add comments" },
  {
    key: "project.comments.update.own",
    scope: "project",
    label: "Edit own comments",
  },
  {
    key: "project.comments.delete.any",
    scope: "project",
    label: "Delete any comments",
  },
  {
    key: "project.comments.delete.own",
    scope: "project",
    label: "Delete own comments",
  },
  { key: "project.reactions.create", scope: "project", label: "Add reactions" },
  { key: "project.cycles.view", scope: "project", label: "View cycles" },
  { key: "project.cycles.create", scope: "project", label: "Create cycles" },
  {
    key: "project.cycles.update.any",
    scope: "project",
    label: "Edit any cycles",
  },
  {
    key: "project.cycles.delete.any",
    scope: "project",
    label: "Delete any cycles",
  },
  {
    key: "project.cycles.delete.own",
    scope: "project",
    label: "Delete own cycles",
  },
  { key: "project.modules.view", scope: "project", label: "View modules" },
  { key: "project.modules.create", scope: "project", label: "Create modules" },
  {
    key: "project.modules.update.any",
    scope: "project",
    label: "Edit any modules",
  },
  {
    key: "project.modules.delete.any",
    scope: "project",
    label: "Delete any modules",
  },
  {
    key: "project.modules.delete.own",
    scope: "project",
    label: "Delete own modules",
  },
  { key: "project.views.view", scope: "project", label: "View views" },
  { key: "project.views.create", scope: "project", label: "Create views" },
  {
    key: "project.views.update.any",
    scope: "project",
    label: "Edit any views",
  },
  {
    key: "project.views.delete.any",
    scope: "project",
    label: "Delete any views",
  },
  {
    key: "project.views.update.own",
    scope: "project",
    label: "Edit own views",
  },
  {
    key: "project.views.delete.own",
    scope: "project",
    label: "Delete own views",
  },
  { key: "project.pages.view", scope: "project", label: "View pages" },
  { key: "project.pages.create", scope: "project", label: "Create pages" },
  {
    key: "project.pages.update.any",
    scope: "project",
    label: "Edit any pages",
  },
  {
    key: "project.pages.delete.any",
    scope: "project",
    label: "Delete any pages",
  },
  {
    key: "project.pages.update.own",
    scope: "project",
    label: "Edit own pages",
  },
  {
    key: "project.pages.delete.own",
    scope: "project",
    label: "Delete own pages",
  },
  { key: "project.labels.view", scope: "project", label: "View labels" },
  { key: "project.states.view", scope: "project", label: "View states" },
  { key: "project.estimates.view", scope: "project", label: "View estimates" },
  { key: "project.labels.manage", scope: "project", label: "Manage labels" },
  { key: "project.states.manage", scope: "project", label: "Manage states" },
  {
    key: "project.estimates.manage",
    scope: "project",
    label: "Manage estimates",
  },
  { key: "project.analytics.view", scope: "project", label: "View analytics" },
  {
    key: "project.analytics.export",
    scope: "project",
    label: "Export analytics",
  },
];

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
  return { router, ...view, user: userEvent.setup() };
}

describe("Admin, Profile, and Common in Vietnamese (Ticket 09)", () => {
  beforeEach(() => {
    setLanguage("vi");
  });

  afterEach(() => {
    cleanup();
    notifications.clean();
    setLanguage("en");
    vi.unstubAllGlobals();
  });

  describe("DB B2, INV-03, INV-15: Permissions and Groups Catalog Verification", () => {
    it("every DB permission has a key in all catalogs, en matches DB label, and permission groups store keys", () => {
      expect(DB_PERMISSIONS).toHaveLength(57);

      for (const perm of DB_PERMISSIONS) {
        const enLabel = (en.permissions as Record<string, string>)[perm.key];
        const viLabel = (viCatalog.permissions as Record<string, string>)[
          perm.key
        ];

        expect(enLabel, `Missing EN label for ${perm.key}`).toBeDefined();
        expect(enLabel).toBe(perm.label);
        expect(viLabel, `Missing VI label for ${perm.key}`).toBeDefined();
        expect(viLabel.length).toBeGreaterThan(0);
      }

      // INV-15: PERMISSION_GROUP_KEYS stores MessageKeys pointing to permissionGroups
      for (const key of Object.values(PERMISSION_GROUP_KEYS)) {
        expect(key).toMatch(/^permissionGroups:/);
        const subKey = key.replace("permissionGroups:", "");
        expect(
          (en.permissionGroups as Record<string, string>)[subKey],
          `Missing EN group label for ${subKey}`,
        ).toBeDefined();
        expect(
          (viCatalog.permissionGroups as Record<string, string>)[subKey],
          `Missing VI group label for ${subKey}`,
        ).toBeDefined();
      }
    });

    it("WEB B4, INV-03, INV-08: error keys resolve to expected strings in both languages", () => {
      // In Vietnamese
      expect(translate(GENERIC_LOAD_ROLES_ERROR_KEY)).toBe(
        "Không thể tải vai trò và quyền hạn.",
      );
      expect(translate(GENERIC_UPDATE_ROLES_ERROR_KEY)).toBe(
        "Không thể cập nhật quyền hạn. Vui lòng thử lại.",
      );
      expect(translate(GENERIC_CREATE_USER_ERROR_KEY)).toBe(
        "Không thể tạo người dùng. Vui lòng thử lại.",
      );
      expect(translate(GENERIC_PROFILE_ERROR_KEY)).toBe(
        "Không thể lưu hồ sơ của bạn. Vui lòng thử lại.",
      );

      // In English
      setLanguage("en");
      expect(translate(GENERIC_LOAD_ROLES_ERROR_KEY)).toBe(
        "Couldn't load roles and permissions.",
      );
      expect(translate(GENERIC_UPDATE_ROLES_ERROR_KEY)).toBe(
        "Couldn't update permissions. Please try again.",
      );
      expect(translate(GENERIC_CREATE_USER_ERROR_KEY)).toBe(
        "Couldn't create the user. Please try again.",
      );
      expect(translate(GENERIC_PROFILE_ERROR_KEY)).toBe(
        "Couldn't save your profile. Please try again.",
      );
    });
  });

  describe("Admin Roles & Permissions (INV-10, AC-12, AC-13)", () => {
    it("dynamically translates permission matrix on language switch without API calls and keeps unsaved changes", async () => {
      let fetchCount = 0;
      const rolesResponse = makeDefaultRolesResponse();

      mockFetch({
        "GET /api/auth/session": () =>
          jsonResponse(
            200,
            makeSession({
              user: { ...makeSession().user, isInstanceAdmin: true },
            }),
          ),
        "GET /api/workspaces": () =>
          jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
        "GET /api/admin/roles": () => {
          fetchCount++;
          return jsonResponse(200, rolesResponse);
        },
      });

      renderApp("/roles-and-permissions");

      // Verify page in Vietnamese (AC-13, INV-12: role names preserved verbatim)
      expect(
        await screen.findByRole("heading", { name: "Vai trò & Quyền hạn" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Vai trò workspace" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Vai trò dự án" }),
      ).toBeInTheDocument();

      // Check role labels preserved verbatim
      expect(screen.getByText("Workspace Admin")).toBeInTheDocument();
      expect(screen.getAllByText("Member").length).toBeGreaterThan(0);
      expect(screen.getByText("Guest")).toBeInTheDocument();

      // Check initial fetch happened once
      // Wait for checkboxes to be rendered once query succeeds
      await waitFor(() => {
        expect(
          document.querySelectorAll('input[type="checkbox"]').length,
        ).toBeGreaterThan(0);
      });

      const memberCheckbox = screen
        .getAllByRole("checkbox")
        .find(
          (cb) =>
            cb.getAttribute("aria-label")?.startsWith("Member:") &&
            !cb.hasAttribute("disabled"),
        ) as HTMLInputElement;
      expect(memberCheckbox).toBeDefined();

      await userEvent.click(memberCheckbox);

      // Unsaved changes bar appears in Vietnamese
      expect(
        await screen.findByText(/1 thay đổi chưa lưu/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Lưu thay đổi" }),
      ).toBeInTheDocument();

      // Switch language to English (INV-10, AC-12)
      setLanguage("en");

      // Verify immediate translation without re-fetching API
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Roles & Permissions" }),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole("tab", { name: /Workspace roles/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /Project roles/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeInTheDocument();

      // Assert no additional API calls occurred during language switch
      expect(fetchCount).toBe(1);

      // Switch back to Vietnamese
      setLanguage("vi");
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Vai trò & Quyền hạn" }),
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/1 thay đổi chưa lưu/i)).toBeInTheDocument();
      expect(fetchCount).toBe(1);
    });
  });

  describe("Admin Users: Create User (INV-08, AC-02, AC-13)", () => {
    it("renders Create User form in Vietnamese with localized validation and errors", async () => {
      mockFetch({
        "GET /api/auth/session": () =>
          jsonResponse(
            200,
            makeSession({
              user: { ...makeSession().user, isInstanceAdmin: true },
            }),
          ),
        "GET /api/workspaces": () =>
          jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
        "GET /api/admin/users": () =>
          jsonResponse(200, {
            items: [],
            total: 0,
            page: 1,
            pageSize: 50,
          }),
      });

      const { user } = renderApp("/users");

      const addUserButton = await screen.findByRole("button", {
        name: "Thêm người dùng",
      });
      await user.click(addUserButton);

      // Verify page and form headings in Vietnamese
      expect(
        await screen.findByRole("heading", { name: "Tạo người dùng" }),
      ).toBeInTheDocument();
      const firstNameInput = screen.getByLabelText(/^Tên\s*\*?$/i);
      const lastNameInput = screen.getByLabelText(/^Họ$/i);
      const displayNameInput = screen.getByLabelText(/^Tên hiển thị\s*\*?$/i);
      const emailInput = screen.getByLabelText(/^Email\s*\*?$/i);
      const passwordInput = screen.getByLabelText(/^Mật khẩu\s*\*?$/i);
      const confirmInput = screen.getByLabelText(/^Xác nhận mật khẩu\s*\*?$/i);

      expect(firstNameInput).toBeInTheDocument();
      expect(lastNameInput).toBeInTheDocument();
      expect(displayNameInput).toBeInTheDocument();
      expect(emailInput).toBeInTheDocument();
      expect(passwordInput).toBeInTheDocument();
      expect(confirmInput).toBeInTheDocument();

      // Trigger blur validations (validateInputOnBlur)
      await user.click(firstNameInput);
      await user.click(emailInput);
      expect(await screen.findByText("Nhập tên")).toBeInTheDocument();

      await user.type(emailInput, "not-an-email");
      await user.click(passwordInput);
      expect(
        await screen.findByText("Nhập một email hợp lệ"),
      ).toBeInTheDocument();

      await user.type(passwordInput, "short");
      await user.click(confirmInput);
      expect(
        await screen.findByText("Dùng từ 8 đến 128 ký tự"),
      ).toBeInTheDocument();
    });

    it("renders Users page table, Edit user modal, and Change password modal in Vietnamese (AC-32)", async () => {
      const targetUser = {
        id: "user-2",
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "an@openplany.dev",
        avatarUrl: null,
        isActive: true,
        isInstanceAdmin: false,
        createdAt: "2026-10-10T10:00:00.000Z",
        updatedAt: "2026-10-10T10:00:00.000Z",
      };

      mockFetch({
        "GET /api/auth/session": () =>
          jsonResponse(
            200,
            makeSession({
              user: { ...makeSession().user, id: "admin-vi-user", isInstanceAdmin: true },
            }),
          ),
        "GET /api/workspaces": () =>
          jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
        "GET /api/admin/users": () =>
          jsonResponse(200, {
            items: [targetUser],
            total: 1,
            page: 1,
            pageSize: 50,
          }),
        "GET /api/admin/users/user-2": () => jsonResponse(200, targetUser),
      });

      const { user } = renderApp("/users");

      // Verify Users page title and elements in Vietnamese
      expect(
        await screen.findByRole("heading", { name: /^Người dùng/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Thêm người dùng" }),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Tìm theo tên hoặc email…"),
      ).toBeInTheDocument();

      // Table headers in Vietnamese
      expect(screen.getByText("Họ tên")).toBeInTheDocument();
      expect(screen.getByText("Tên hiển thị")).toBeInTheDocument();
      expect(screen.getByText("Email")).toBeInTheDocument();
      expect(screen.getByText("Ngày tạo tài khoản")).toBeInTheDocument();

      // Open row actions menu for target user
      const actionMenuBtn = await screen.findByRole("button", {
        name: "Thao tác cho An Nguyen",
      });
      await user.click(actionMenuBtn);

      expect(screen.getByText("Sửa người dùng")).toBeInTheDocument();
      expect(screen.getByText("Đổi mật khẩu")).toBeInTheDocument();

      // Click Edit user
      await user.click(screen.getByText("Sửa người dùng"));
      expect(
        await screen.findByRole("heading", { name: "Sửa người dùng" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^Tên\s*\*?$/i)).toHaveValue("An");
      expect(screen.getByLabelText(/^Họ$/i)).toHaveValue("Nguyen");
      expect(screen.getByLabelText(/^Tên hiển thị\s*\*?$/i)).toHaveValue("An Nguyen");
      expect(screen.getByLabelText(/^Email\s*\*?$/i)).toHaveValue("an@openplany.dev");
      expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeInTheDocument();

      // Close Edit modal
      await user.click(screen.getByRole("button", { name: "Huỷ" }));

      // Open Change password modal
      await user.click(actionMenuBtn);
      await user.click(screen.getByText("Đổi mật khẩu"));
      expect(
        await screen.findByRole("heading", { name: "Đổi mật khẩu" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Nếu An Nguyen đang bị tạm khoá do đăng nhập sai nhiều lần/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^Mật khẩu\s*\*?$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Xác nhận mật khẩu\s*\*?$/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Đổi mật khẩu" }),
      ).toBeInTheDocument();
    });
  });

  describe("Profile Modal (INV-13, AC-02, AC-13)", () => {
    it("validates profile names in Vietnamese", () => {
      expect(validateName("firstName", "")).toBe("Nhập tên của bạn");
      expect(validateName("displayName", "")).toBe("Nhập tên hiển thị");
      expect(validateName("displayName", "a".repeat(51))).toBe(
        "Tên hiển thị phải có từ 50 ký tự trở xuống",
      );
      expect(validateName("lastName", "Ka​i")).toBe(
        "Chứa ký tự không được phép",
      );
    });

    it("renders Profile modal in Vietnamese, confirms discard, and allows keeping edits", async () => {
      mockFetch({
        "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      });
      const authUser = makeSession().user;
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(
        <AppUiProvider>
          <Notifications />
          <AuthProvider>
            <ProfileModal opened={true} onClose={onClose} user={authUser} />
          </AuthProvider>
        </AppUiProvider>,
      );

      // Verify modal elements in Vietnamese
      expect(screen.getByRole("dialog", { name: "Hồ sơ" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Tên\s*\*?$/i)).toHaveValue("An");
      expect(screen.getByLabelText(/^Họ$/i)).toHaveValue("Nguyen");
      expect(screen.getByLabelText(/^Tên hiển thị\s*\*?$/i)).toHaveValue(
        "An Nguyen",
      );

      // Edit display name to trigger unsaved changes
      const displayNameInput = screen.getByLabelText(/^Tên hiển thị\s*\*?$/i);
      await user.clear(displayNameInput);
      await user.type(displayNameInput, "An Pro");

      // Try closing modal via close button
      const closeButton = screen.getByRole("button", { name: "Đóng hồ sơ" });
      await user.click(closeButton);

      // Discard confirmation banner appears in Vietnamese
      expect(
        await screen.findByText("Huỷ các thay đổi chưa lưu?"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Huỷ" })).toBeInTheDocument();

      // Click Keep editing -> returns to form
      await user.click(
        screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }),
      );
      expect(
        screen.queryByText("Huỷ các thay đổi chưa lưu?"),
      ).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      // Try closing again and click Discard -> calls onClose
      await user.click(closeButton);
      expect(
        await screen.findByText("Huỷ các thay đổi chưa lưu?"),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Huỷ" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
