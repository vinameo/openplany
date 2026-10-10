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
  it("renders page with title 'Roles & Permissions', document title, and 5 tables found by caption for instance admin", async () => {
    renderRoute({ isInstanceAdmin: true });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Roles & Permissions",
      }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Roles & Permissions · OpenPlany");

    // Section headings
    expect(
      screen.getByRole("heading", { level: 2, name: "Workspace roles" }),
    ).toBeInTheDocument();
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
        name: "Workspace permissions",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Project permissions",
      }),
    ).toBeInTheDocument();

    // 5 tables found by caption
    expect(
      screen.getByRole("table", { name: "Workspace roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Project roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Project access by workspace role" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("table", {
        name: "Workspace permissions by role",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Project permissions by role" }),
    ).toBeInTheDocument();

    // Admin cell is locked
    const adminCheckbox = screen.getByRole("checkbox", {
      name: "Admin: Edit workspace settings",
    });
    expect(adminCheckbox).toBeDisabled();

    // Guest: Edit workspace settings is locked by guardrail G4
    const guestCheckbox = screen.getByRole("checkbox", {
      name: "Guest: Edit workspace settings",
    });
    expect(guestCheckbox).toBeDisabled();
    expect(screen.getAllByText("Guests can only view").length).toBeGreaterThan(0);

    // "Not enforced yet" badge next to Delete workspace
    const deleteRow = screen.getByRole("row", { name: /Delete workspace/i });
    expect(within(deleteRow).getByText("Not enforced yet")).toBeInTheDocument();

    // Project access table has accessible placeholder
    expect(
      screen.getAllByText("Only projects they're added to").length,
    ).toBeGreaterThan(0);
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

  it("renders first 3 blocks even when GET /api/admin/roles fails, and recovers with Try again", async () => {
    let shouldFail = true;
    const { user } = renderRoute({
      extraMocks: {
        "GET /api/admin/roles": () => {
          if (shouldFail) {
            return apiError(500, "INTERNAL_ERROR", "Database error");
          }
          return jsonResponse(200, makeDefaultRolesResponse());
        },
      },
    });

    // First 3 tables are still rendered
    expect(
      await screen.findByRole("table", { name: "Workspace roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Project roles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Project access by workspace role" }),
    ).toBeInTheDocument();

    // Load error shown
    expect(await screen.findAllByText("Couldn't load permissions.")).toHaveLength(2);

    shouldFail = false;
    const tryAgainBtns = screen.getAllByRole("button", { name: "Try again" });
    await user.click(tryAgainBtns[0]!);

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
