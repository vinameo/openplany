import { render, screen, waitFor } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";

function renderApp(initialPath = "/") {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  render(
    <AppUiProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeRedirect", () => {
  it("AC 13: 0 workspaces -> stays at / and displays NoWorkspaceHome empty state", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    const { router } = renderApp("/");

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("AC 14: redirects to lastWorkspaceSlug when present", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [
            {
              id: "ws-1",
              name: "Alpha",
              slug: "alpha",
              logoUrl: null,
              backgroundColor: "#0F172A",
              organizationSize: "2-10",
              timezone: "UTC",
              role: "admin",
              memberCount: 1,
              createdAt: new Date().toISOString(),
            },
            {
              id: "ws-2",
              name: "Beta",
              slug: "beta",
              logoUrl: null,
              backgroundColor: "#1D4ED8",
              organizationSize: "2-10",
              timezone: "UTC",
              role: "admin",
              memberCount: 3,
              createdAt: new Date().toISOString(),
            },
          ],
          lastWorkspaceSlug: "beta",
        }),
      "GET /api/workspaces/beta": () =>
        jsonResponse(200, {
          id: "ws-2",
          name: "Beta",
          slug: "beta",
          logoUrl: null,
          backgroundColor: "#1D4ED8",
          organizationSize: "2-10",
          timezone: "UTC",
          role: "admin",
          memberCount: 3,
          createdAt: new Date().toISOString(),
        }),
    });

    const { router } = renderApp("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/beta");
    });
  });

  it("AC 14: redirects to first alphabetical workspace if lastWorkspaceSlug is null", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [
            {
              id: "ws-1",
              name: "Alpha Org",
              slug: "alpha-org",
              logoUrl: null,
              backgroundColor: "#0F172A",
              organizationSize: "2-10",
              timezone: "UTC",
              role: "admin",
              memberCount: 1,
              createdAt: new Date().toISOString(),
            },
          ],
          lastWorkspaceSlug: null,
        }),
      "GET /api/workspaces/alpha-org": () =>
        jsonResponse(200, {
          id: "ws-1",
          name: "Alpha Org",
          slug: "alpha-org",
          logoUrl: null,
          backgroundColor: "#0F172A",
          organizationSize: "2-10",
          timezone: "UTC",
          role: "admin",
          memberCount: 1,
          createdAt: new Date().toISOString(),
        }),
    });

    const { router } = renderApp("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/alpha-org");
    });
  });
});

