import { render, screen, waitFor } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { makeWorkspace } from "../test/workspaceFixtures";

function renderSettingsApp(initialPath: string) {
  const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: "openstudy" }),
    "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
  });

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

describe("WorkspaceSettingsLayout", () => {
  it("redirects /openstudy/settings to /openstudy/settings/general and renders General tab with aria-current", async () => {
    const { router } = renderSettingsApp("/openstudy/settings");

    const headings = await screen.findAllByRole("heading", {
      name: "Workspace settings",
    });
    expect(headings.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/openstudy/settings/general");
      expect(screen.getByRole("link", { name: /General/i })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    const backButtons = screen.getAllByRole("link", {
      name: "Back to workspace",
    });
    expect(backButtons[0]).toHaveAttribute("href", "/openstudy");
  });

  it("renders Settings page not found when visiting an unknown section, keeping sidebar intact", async () => {
    renderSettingsApp("/openstudy/settings/unknown");

    expect(
      await screen.findByRole("heading", {
        name: "Settings page not found",
      }),
    ).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", {
      name: "Workspace settings",
    });
    expect(headings.length).toBeGreaterThan(0);

    const backButtons = screen.getAllByRole("link", {
      name: "Back to workspace",
    });
    expect(backButtons[0]).toHaveAttribute("href", "/openstudy");
  });

  it("does not render any link or section for 'Roles' in the sidebar (AC-12b)", async () => {
    renderSettingsApp("/openstudy/settings/general");

    const headings = await screen.findAllByRole("heading", {
      name: "Workspace settings",
    });
    expect(headings.length).toBeGreaterThan(0);

    expect(screen.getByRole("link", { name: /General/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Roles/i })).not.toBeInTheDocument();
  });
});

