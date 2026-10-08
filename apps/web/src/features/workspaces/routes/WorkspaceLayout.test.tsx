import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [path],
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

describe("WorkspaceLayout", () => {
  it("AC 16: renders 404 Workspace not found when workspace API returns 404", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "GET /api/workspaces/unknown-ws": () =>
        apiError(404, "NOT_FOUND", "Workspace not found"),
    });

    renderApp("/unknown-ws");

    expect(
      await screen.findByRole("heading", { name: "Workspace not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It doesn't exist or you don't have access."),
    ).toBeInTheDocument();
  });

  it("handles 401 unauthenticated by expiring session", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "GET /api/workspaces/expired-ws": () =>
        apiError(401, "UNAUTHENTICATED", "Sign in to continue"),
    });

    const { router } = renderApp("/expired-ws");

    expect(
      await screen.findByRole("heading", { name: "Sign in to OpenPlany" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });
});

