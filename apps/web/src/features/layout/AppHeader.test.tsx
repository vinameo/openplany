import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { makeSession } from "../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../test/fetchMock";
import { WorkspaceProvider } from "../workspaces/WorkspaceProvider";
import { AppHeader } from "./AppHeader";

function renderHeader(currentWorkspace?: Parameters<typeof AppHeader>[0]["currentWorkspace"]) {
  render(
    <AppUiProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <MemoryRouter>
            <AppHeader currentWorkspace={currentWorkspace} />
          </MemoryRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </AppUiProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppHeader", () => {
  it("AC 13: 0 workspaces shows 'Create workspace' link and 'Sign out' button when isInstanceAdmin is true", async () => {
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
    });

    renderHeader();

    const links = await screen.findAllByRole("link", { name: /create workspace/i });
    expect(links.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("0 workspaces hides 'Create workspace' link when isInstanceAdmin is false", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: false },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    renderHeader();

    await screen.findByRole("button", { name: /sign out/i });
    expect(
      screen.queryByRole("link", { name: /create workspace/i }),
    ).not.toBeInTheDocument();
  });

  it("AC 17: in workspace shows WorkspaceSwitcher and hides standalone Sign out", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [
            {
              id: "ws-1",
              name: "Acme Corp",
              slug: "acme-corp",
              logoUrl: null,
              backgroundColor: "#0F172A",
              organizationSize: "2-10",
              timezone: "UTC",
              role: "owner",
              permissions: ["workspace.settings.update"],
              memberCount: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    renderHeader({
      id: "ws-1",
      name: "Acme Corp",
      slug: "acme-corp",
      logoUrl: null,
      backgroundColor: "#0F172A",
      organizationSize: "2-10",
      timezone: "UTC",
      role: "owner",
      permissions: ["workspace.settings.update"],
      memberCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(
      await screen.findByRole("button", {
        name: "Switch workspace – Acme Corp",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^sign out$/i }),
    ).not.toBeInTheDocument();
  });
});
