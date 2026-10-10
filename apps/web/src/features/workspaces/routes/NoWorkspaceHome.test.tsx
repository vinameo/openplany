import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { WorkspaceProvider } from "../WorkspaceProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { NoWorkspaceHome } from "./NoWorkspaceHome";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("NoWorkspaceHome", () => {
  it("renders instance admin copy without 'invite' and renders Create workspace button", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: {
              ...makeSession().user,
              isEmailVerified: false,
              isInstanceAdmin: true,
            },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoWorkspaceHome />
            </MemoryRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Create one to start planning, or ask a workspace Admin to add you.",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByText(/invite/i)).toBeNull();

    expect(
      screen.getAllByRole("link", { name: "Create workspace" }).length,
    ).toBeGreaterThanOrEqual(1);

    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
  });

  it("renders non-admin copy without 'invite' and hides Create workspace button", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: {
              ...makeSession().user,
              isInstanceAdmin: false,
            },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoWorkspaceHome />
            </MemoryRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Ask a workspace Admin to add you to a workspace to get started.",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByText(/invite/i)).toBeNull();

    expect(
      screen.queryByRole("link", { name: "Create workspace" }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
  });

  it("AC-23: 'Check again' button refetches workspaces and redirects when user has been added to a workspace", async () => {
    let callCount = 0;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null });
        }
        return jsonResponse(200, {
          workspaces: [
            {
              id: "ws-new",
              name: "Newly Added",
              slug: "newly-added",
              logoUrl: null,
              backgroundColor: "#0F172A",
              organizationSize: "2-10",
              timezone: "UTC",
              role: "member",
              memberCount: 2,
              createdAt: new Date().toISOString(),
            },
          ],
          lastWorkspaceSlug: "newly-added",
        });
      },
      "GET /api/workspaces/newly-added": () =>
        jsonResponse(200, {
          id: "ws-new",
          name: "Newly Added",
          slug: "newly-added",
          logoUrl: null,
          backgroundColor: "#0F172A",
          organizationSize: "2-10",
          timezone: "UTC",
          role: "member",
          memberCount: 2,
          createdAt: new Date().toISOString(),
        }),
    });

    const router = createMemoryRouter(appRoutes, { initialEntries: ["/"] });

    render(
      <AppUiProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppUiProvider>,
    );

    const checkButton = await screen.findByRole("button", {
      name: "Check again",
    });
    expect(checkButton).toBeInTheDocument();

    await userEvent.click(checkButton);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/newly-added");
    });
  });

  it("displays 'Couldn't check. Try again.' on refresh error and stays on page", async () => {
    let callCount = 0;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null });
        }
        return new Response(JSON.stringify({ message: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoWorkspaceHome />
            </MemoryRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    const checkButton = await screen.findByRole("button", {
      name: "Check again",
    });
    await userEvent.click(checkButton);

    expect(
      await screen.findByText("Couldn't check. Try again."),
    ).toBeInTheDocument();
  });

  it("refetches on visibilitychange to visible only if at least 10s elapsed", async () => {
    let callCount = 0;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () => {
        callCount++;
        return jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null });
      },
    });

    let currentTime = 100000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <MemoryRouter>
              <NoWorkspaceHome />
            </MemoryRouter>
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    await screen.findByRole("heading", {
      name: "You're not in a workspace yet",
    });

    // Allow initial auth & workspace mount requests to settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const settledCalls = callCount;

    // Mock visibilityState
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });

    // Fire visibility change before 10s (e.g. 5s)
    currentTime += 5000;
    fireEvent(document, new Event("visibilitychange"));
    expect(callCount).toBe(settledCalls);

    // Advance past 10s total (e.g. another 6s, total 11s)
    currentTime += 6000;
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => {
      expect(callCount).toBe(settledCalls + 1);
    });

    nowSpy.mockRestore();
  });
});
