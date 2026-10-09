import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { ROLES_AND_PERMISSIONS_PATH } from "./rolesOverview";

function renderRoute(options?: {
  isInstanceAdmin?: boolean;
  extraMocks?: Parameters<typeof mockFetch>[0];
  initialEntries?: string[];
  initialIndex?: number;
}) {
  const isInstanceAdmin = options?.isInstanceAdmin ?? true;
  mockFetch({
    "GET /api/auth/session": () =>
      jsonResponse(
        200,
        makeSession({
          user: { ...makeSession().user, isInstanceAdmin },
        }),
      ),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
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
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

describe("RolesAndPermissionsRoute", () => {
  it("renders page with title 'Roles & Permissions', document title, and 4 tables found by caption for instance admin", async () => {
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
        name: "What each role can do",
      }),
    ).toBeInTheDocument();

    // 4 tables found by caption
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
      screen.getByRole("table", { name: "Permissions by workspace role" }),
    ).toBeInTheDocument();

    // Matrix cells have accessible text
    expect(screen.getAllByText("Allowed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not allowed").length).toBeGreaterThan(0);

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
});
