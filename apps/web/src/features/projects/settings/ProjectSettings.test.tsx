import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem, ProjectResponse } from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { makeWorkspace } from "../../workspaces/test/workspaceFixtures";
import { PROJECT_SETTINGS_MESSAGES } from "./projectSettingsMessages";

const testWorkspace = makeWorkspace({
  id: "ws-1",
  slug: "the-firsts",
  name: "The Firsts",
  timezone: "Asia/Ho_Chi_Minh",
  role: "admin",
  permissions: [],
});

const sampleProject: ProjectListItem = {
  id: "p-11",
  name: "The First Project",
  identifier: "TFP11",
  description: "Initial description",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
  timezone: null,
  effectiveTimezone: "Asia/Ho_Chi_Minh",
  members: [],
  memberCount: 0,
  role: "admin",
  permissions: ["project.settings.view", "project.settings.update"],
};

function renderProjectSettingsApp({
  initialEntries = ["/the-firsts/projects/TFP11/settings"],
  project = sampleProject,
  onPatchProject,
}: {
  initialEntries?: string[];
  project?: ProjectListItem;
  onPatchProject?: (body: unknown) => ProjectResponse;
} = {}) {
  let currentProject = project;

  mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces: [testWorkspace],
        lastWorkspaceSlug: "the-firsts",
      }),
    "GET /api/workspaces/the-firsts": () => jsonResponse(200, testWorkspace),
    "GET /api/workspaces/the-firsts/projects/TFP11": () =>
      jsonResponse(200, { project: currentProject }),
    "PATCH /api/workspaces/the-firsts/projects/TFP11": (req) => {
      const body = req?.body;
      const parsedBody =
        typeof body === "string" ? JSON.parse(body) : body;
      if (onPatchProject) {

        const res = onPatchProject(parsedBody);
        currentProject = res.project;
        return jsonResponse(200, res);
      }
      const updated = {
        ...currentProject,
        ...(parsedBody as Record<string, unknown>),
        updatedAt: "2026-10-12T10:05:00.000Z",
      };
      currentProject = updated;
      return jsonResponse(200, { project: updated });
    },
  });

  const router = createMemoryRouter(appRoutes, {
    initialEntries,
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
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProjectSettings", () => {
  it("AC-01 & AC-02: redirects /settings to /settings/general, shows sidebar with Back to project link", async () => {
    const { router } = renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings"],
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        "/the-firsts/projects/TFP11/settings/general",
      );
    });

    const headings = screen.getAllByRole("heading", {
      name: "Project settings",
    });
    expect(headings.length).toBeGreaterThan(0);


    const backButtons = screen.getAllByRole("link", {
      name: "Back to project",
    });
    expect(backButtons[0]).toHaveAttribute(
      "href",
      "/the-firsts/projects/TFP11",
    );
  });

  it("AC-03: renders General active tab and Members as Coming soon without href", async () => {
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
    });

    const generalLink = await screen.findByRole("link", { name: /General/i });
    expect(generalLink).toHaveAttribute("aria-current", "page");

    const membersBtn = screen.getByRole("button", { name: /Members/i });
    expect(membersBtn).toBeInTheDocument();
    expect(membersBtn).toHaveAttribute("aria-disabled", "true");
    expect(membersBtn).not.toHaveAttribute("href");
  });

  it("AC-04: ProjectSettingsCard displays project name, role label, and icon", async () => {
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
    });

    expect(
      await screen.findByText("The First Project", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Project Admin")).toBeInTheDocument();
  });

  it("AC-05: read-only mode when user lacks project.settings.update", async () => {
    const readOnlyProject: ProjectListItem = {
      ...sampleProject,
      permissions: ["project.settings.view"],
    };

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      project: readOnlyProject,
    });

    expect(
      await screen.findByText("You don't have permission to change these settings."),
    ).toBeInTheDocument();

    const nameInput = screen.getByRole("textbox", { name: /Project name/i });
    expect(nameInput).toHaveAttribute("readonly");

    const descInput = screen.getByRole("textbox", { name: /Description/i });
    expect(descInput).toHaveAttribute("readonly");

    expect(
      screen.queryByRole("button", { name: "Update project" }),
    ).not.toBeInTheDocument();
  });

  it("AC-06 & AC-08 & AC-09: can edit project name and description, Project ID is read-only with tooltip, and saves successfully", async () => {
    const user = userEvent.setup();
    let patchedBody: unknown = null;

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: (body) => {
        patchedBody = body;
        return {
          project: {
            ...sampleProject,
            name: "Renamed Project",
            description: "Updated description",
            updatedAt: "2026-10-12T10:05:00.000Z",
          },
        };
      },
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const descInput = screen.getByRole("textbox", { name: /Description/i });
    const idInput = screen.getByRole("textbox", { name: /Project ID/i });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    // Project ID is read-only
    expect(idInput).toHaveAttribute("readonly");
    expect(idInput).toHaveValue("TFP11");

    // Tooltip button for Project ID
    const infoBtn = screen.getByRole("button", { name: "About project ID" });
    expect(infoBtn).toBeInTheDocument();
    await user.hover(infoBtn);
    expect(
      await screen.findByText(PROJECT_SETTINGS_MESSAGES.identifierReadOnly),
    ).toBeInTheDocument();

    // Submit button disabled initially (no changes)
    expect(submitBtn).toBeDisabled();


    // Modify fields
    await user.clear(nameInput);
    await user.type(nameInput, "Renamed Project");
    await user.clear(descInput);
    await user.type(descInput, "Updated description");

    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchedBody).toEqual({
        name: "Renamed Project",
        description: "Updated description",
      });
    });

    // Form retains new values and button is disabled again (no pending changes)
    await waitFor(() => {
      expect(nameInput).toHaveValue("Renamed Project");
      expect(submitBtn).toBeDisabled();
    });
  });

  it("renders Settings page not found when navigating to unknown section", async () => {
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/unknown"],
    });

    expect(
      await screen.findByRole("heading", {
        name: "Settings page not found",
      }),
    ).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", {
      name: "Project settings",
    });
    expect(headings.length).toBeGreaterThan(0);
  });


  it("AC-37: document title reflects section and project name", async () => {
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
    });

    await waitFor(() => {
      expect(document.title).toBe("General · The First Project settings");
    });
  });
});
