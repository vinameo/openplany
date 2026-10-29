import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { makeDefaultRolesResponse } from "./test/rolesFixtures";
import { ROLES_AND_PERMISSIONS_PATH } from "./rolesOverview";
import { translate } from "../../../i18n/language";

const rolesLoadError = translate("admin:roles.errors.loadFailed");

function renderRoute(options?: {
  isInstanceAdmin?: boolean;
  extraMocks?: Parameters<typeof mockFetch>[0];
  initialEntries?: string[];
  initialIndex?: number;
}) {
  const isInstanceAdmin = options?.isInstanceAdmin ?? true;
  const defaultRoles = makeDefaultRolesResponse();

  const fetchMock = mockFetch({
    "GET /api/auth/session": () =>
      jsonResponse(
        200,
        makeSession({
          user: { ...makeSession().user, isInstanceAdmin },
        }),
      ),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    "GET /api/admin/roles": () => jsonResponse(200, defaultRoles),
    ...options?.extraMocks,
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries: options?.initialEntries ?? [ROLES_AND_PERMISSIONS_PATH],
    initialIndex: options?.initialIndex,
  });

  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router, user: userEvent.setup(), fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("RolesAndPermissionsRoute", { timeout: 15000 }, () => {
  it("renders page with title 'Roles & Permissions', document title, and tabs with Workspace roles active by default", async () => {
    renderRoute({ isInstanceAdmin: true });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Roles & Permissions",
      }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Roles & Permissions · OpenPlany");

    // Two tabs
    const wsTab = screen.getByRole("tab", { name: "Workspace roles" });
    const projTab = screen.getByRole("tab", { name: "Project roles" });
    expect(wsTab).toBeInTheDocument();
    expect(projTab).toBeInTheDocument();
    expect(wsTab).toHaveAttribute("aria-selected", "true");
    expect(projTab).toHaveAttribute("aria-selected", "false");

    // In Workspace tab: Workspace roles table & Workspace permissions table
    expect(
      screen.getByRole("heading", { level: 2, name: "Workspace roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Workspace permissions",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("table", { name: "Workspace roles" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("table", {
        name: "Workspace permissions by role",
      }),
    ).toBeInTheDocument();

    // Workspace Admin cell is locked
    const adminCheckbox = screen.getByRole("checkbox", {
      name: "Workspace Admin: Edit workspace settings",
    });
    expect(adminCheckbox).toBeDisabled();

    // Guest: Edit workspace settings is locked by guardrail G4
    const guestCheckbox = screen.getByRole("checkbox", {
      name: "Guest: Edit workspace settings",
    });
    expect(guestCheckbox).toBeDisabled();
    expect(
      screen.getAllByText("Guests and Viewers can only view").length,
    ).toBeGreaterThan(0);

    // "Not enforced yet" badge next to Delete workspace
    const deleteRow = screen.getByRole("row", { name: /Delete workspace/i });
    expect(within(deleteRow).getByText("Not enforced yet")).toBeInTheDocument();

    // Manage workspace states is enforced (AC-25)
    const statesManageRow = screen.getByRole("row", {
      name: /Manage workspace states/i,
    });
    expect(within(statesManageRow).queryByText("Not enforced yet")).toBeNull();
  });

  it("opens Project roles tab when URL has ?tab=project, and falls back to workspace on unknown param", async () => {
    // 1. Initial URL with ?tab=project
    const { router: projectRouter } = renderRoute({
      initialEntries: [`${ROLES_AND_PERMISSIONS_PATH}?tab=project`],
    });

    const projectTab = await screen.findByRole("tab", {
      name: "Project roles",
    });
    expect(projectTab).toHaveAttribute("aria-selected", "true");

    expect(
      screen.getByRole("heading", { level: 2, name: "Project roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Workspace roles in projects",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Project permissions",
      }),
    ).toBeInTheDocument();

    await screen.findByRole("table", {
      name: "Project permissions by role",
    });

    // Enforced project permissions don't have "Not enforced yet" badge (AC-25)
    const workItemsViewRow = screen.getByRole("row", {
      name: /View work items/i,
    });
    expect(within(workItemsViewRow).queryByText("Not enforced yet")).toBeNull();

    const statesViewRow = screen.getByRole("row", { name: /View states/i });
    expect(within(statesViewRow).queryByText("Not enforced yet")).toBeNull();

    const statesManageRow = screen.getByRole("row", {
      name: /^Manage states/i,
    });
    expect(within(statesManageRow).queryByText("Not enforced yet")).toBeNull();

    // Unenforced project permission still has "Not enforced yet" (AC-25)
    const labelsViewRow = screen.getByRole("row", { name: /View labels/i });
    expect(
      within(labelsViewRow).getByText("Not enforced yet"),
    ).toBeInTheDocument();

    expect(projectRouter.state.location.search).toBe("?tab=project");
  });

  it("falls back to workspace tab when URL has unknown tab param", async () => {
    renderRoute({
      initialEntries: [`${ROLES_AND_PERMISSIONS_PATH}?tab=unknown_tab`],
    });

    const wsTab = await screen.findByRole("tab", { name: "Workspace roles" });
    expect(wsTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders 4-column project access table with locked selects, focus/hover tooltip, and null placeholders (AC-17)", async () => {
    const { user } = renderRoute({
      initialEntries: [`${ROLES_AND_PERMISSIONS_PATH}?tab=project`],
    });

    const policyTable = await screen.findByRole("table", {
      name: "Workspace roles in projects",
    });
    expect(policyTable).toBeInTheDocument();

    // Check 4 columns in header
    expect(
      within(policyTable).getByRole("columnheader", { name: "Workspace role" }),
    ).toBeInTheDocument();
    expect(
      within(policyTable).getByRole("columnheader", { name: "Every project" }),
    ).toBeInTheDocument();
    expect(
      within(policyTable).getByRole("columnheader", {
        name: "Lowest role when added",
      }),
    ).toBeInTheDocument();
    expect(
      within(policyTable).getByRole("columnheader", {
        name: "Highest role when added",
      }),
    ).toBeInTheDocument();

    // Check 3 rows: Workspace Admin, Member, Guest
    const rows = within(policyTable).getAllByRole("row");
    // Row 0 is header, rows 1..3 are data
    expect(rows).toHaveLength(4);

    // Workspace Admin row has locked select for "Every project", and "—" for lowest and highest
    const adminSelect = within(policyTable).getByRole("combobox", {
      name: "Workspace Admin: Every project",
    });
    expect(adminSelect).toBeDisabled();

    // Focus wrapper and verify tooltip text
    const wrapper = adminSelect.closest("span[tabindex='0']");
    expect(wrapper).not.toBeNull();
    if (wrapper) {
      await user.hover(wrapper);
      expect(
        await screen.findByText("Set by OpenPlany. It can't be changed here."),
      ).toBeInTheDocument();
      await user.unhover(wrapper);
    }

    // Accessible placeholders for nulls
    expect(
      within(policyTable).getAllByText("Only projects they're added to").length,
    ).toBeGreaterThan(0);
    expect(
      within(policyTable).getAllByText("Not added to projects").length,
    ).toBeGreaterThan(0);
  });

  it("switches tab and preserves unsaved changes with indicator dot on tab (WEB B4.1, AC-17)", async () => {
    const { user, router } = renderRoute();

    // Make a change on workspace tab
    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Member: Edit workspace settings",
    });
    await user.click(memberCheckbox);
    expect(memberCheckbox).toBeChecked();

    // SaveChangesBar is visible
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // Switch to Project roles tab
    const projTab = screen.getByRole("tab", { name: "Project roles" });
    await user.click(projTab);

    // URL is updated to ?tab=project
    await waitFor(() => {
      expect(router.state.location.search).toBe("?tab=project");
    });

    // SaveChangesBar is still visible outside panel
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // Workspace tab has unsaved changes indicator
    expect(screen.getByText("(unsaved changes)")).toBeInTheDocument();

    // Switch back to Workspace roles tab
    const wsTab = screen.getByRole("tab", { name: /Workspace roles/i });
    await user.click(wsTab);

    // Checkbox is still checked
    expect(memberCheckbox).toBeChecked();
  });

  it("redirects non-instance admin away to / (AC-12b)", async () => {
    const { router } = renderRoute({ isInstanceAdmin: false });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("Back button navigates to / when opened directly without history", async () => {
    const { user, router } = renderRoute({ isInstanceAdmin: true });

    const backBtn = await screen.findByRole("button", { name: "Back" });
    await user.click(backBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("Back button navigates back when opened with history", async () => {
    const originalState = window.history.state;
    try {
      window.history.replaceState({ idx: 1 }, "");
      const { user, router } = renderRoute({
        isInstanceAdmin: true,
        initialEntries: ["/create-user", ROLES_AND_PERMISSIONS_PATH],
        initialIndex: 1,
      });

      const backBtn = await screen.findByRole("button", { name: "Back" });
      await user.click(backBtn);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/create-user");
      });
    } finally {
      window.history.replaceState(originalState, "");
    }
  });

  it("renders rolesLoadError without leaking err.message when GET /api/admin/roles fails, and recovers with Try again", async () => {
    let shouldFail = true;
    const { user } = renderRoute({
      extraMocks: {
        "GET /api/admin/roles": () => {
          if (shouldFail) {
            return apiError(
              500,
              "INTERNAL_ERROR",
              "Sensitive DB error message",
            );
          }
          return jsonResponse(200, makeDefaultRolesResponse());
        },
      },
    });

    // Static overview section still renders
    expect(
      await screen.findByRole("table", { name: "Workspace roles" }),
    ).toBeInTheDocument();

    // Load error shown with rolesLoadError message, NOT the sensitive error message
    expect(
      screen.queryByText("Sensitive DB error message"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(rolesLoadError)).toBeInTheDocument();

    shouldFail = false;
    const tryAgainBtn = screen.getByRole("button", { name: "Try again" });
    await user.click(tryAgainBtn);

    // Recovered
    expect(
      await screen.findByRole("table", {
        name: "Workspace permissions by role",
      }),
    ).toBeInTheDocument();
  });

  it("edits permission, shows unsaved changes bar, confirms modal, and saves with single PATCH (AC-33)", async () => {
    let patchCalled = false;
    let patchBody: unknown = null;

    const { user } = renderRoute({
      extraMocks: {
        "PATCH /api/admin/role-permissions": (init) => {
          patchCalled = true;
          patchBody = init?.body ? JSON.parse(String(init.body)) : null;
          const updated = makeDefaultRolesResponse();
          const member = updated.roles.find(
            (r) => r.scope === "workspace" && r.key === "member",
          )!;
          (member.permissions as string[]).push("workspace.settings.update");
          member.version = 2;
          return jsonResponse(200, updated);
        },
      },
    });

    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Member: Edit workspace settings",
    });
    expect(memberCheckbox).not.toBeChecked();

    // Toggle on
    await user.click(memberCheckbox);
    expect(memberCheckbox).toBeChecked();

    // SaveChangesBar appears
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // Click Save changes
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // Confirm modal opens
    expect(
      await screen.findByRole("dialog", { name: "Save permission changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("+ Edit workspace settings")).toBeInTheDocument();

    // Click Save inside modal
    const saveBtn = await screen.findByRole("button", { name: "Save" });
    await user.click(saveBtn);

    // Patch was called
    await waitFor(() => {
      expect(patchCalled).toBe(true);
    });
    expect(patchBody).toEqual({
      changes: [
        {
          scope: "workspace",
          key: "member",
          version: 1,
          permissions: expect.arrayContaining([
            "workspace.settings.view",
            "workspace.settings.update",
          ]),
        },
      ],
    });

    // Bar disappears after saving
    await waitFor(() => {
      expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument();
    });
  });

  it("discards draft changes when clicking Discard button", async () => {
    const { user } = renderRoute();

    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Member: Edit workspace settings",
    });
    await user.click(memberCheckbox);
    expect(screen.getByText("1 unsaved change")).toBeInTheDocument();

    // Click Discard
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(screen.queryByText("1 unsaved change")).not.toBeInTheDocument();
    expect(memberCheckbox).not.toBeChecked();
  });

  it("handles 409 conflict and offers Reload button", async () => {
    let getCallCount = 0;
    const { user } = renderRoute({
      extraMocks: {
        "GET /api/admin/roles": () => {
          getCallCount++;
          return jsonResponse(200, makeDefaultRolesResponse());
        },
        "PATCH /api/admin/role-permissions": () =>
          apiError(
            409,
            "ROLE_PERMISSIONS_CHANGED",
            "Someone else changed these permissions",
          ),
      },
    });

    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Member: Edit workspace settings",
    });
    await user.click(memberCheckbox);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const saveBtn = await screen.findByRole("button", { name: "Save" });
    await user.click(saveBtn);

    // Conflict alert appears
    expect(
      await screen.findByText(
        "Someone else changed these permissions. Reload to see the latest.",
      ),
    ).toBeInTheDocument();

    const initialGetCount = getCallCount;
    // Click Reload
    await user.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => {
      expect(getCallCount).toBeGreaterThan(initialGetCount);
    });
    expect(
      screen.queryByText(
        "Someone else changed these permissions. Reload to see the latest.",
      ),
    ).not.toBeInTheDocument();
  });
});
