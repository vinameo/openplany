import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import {
  effectiveProjectTimezone,
  type ProjectListItem,
  type ProjectResponse,
} from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { notifications } from "@mantine/notifications";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
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
  onGetProject,
  customRoutes = {},
}: {
  initialEntries?: string[];
  project?: ProjectListItem;
  onPatchProject?: (body: unknown) => ProjectResponse | Response;
  onGetProject?: () => ProjectResponse | Response;
  customRoutes?: Record<string, (init?: RequestInit) => Response | Promise<Response>>;
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
    "GET /api/workspaces/the-firsts/projects/TFP11": () => {
      if (onGetProject) {
        const res = onGetProject();
        if (res instanceof Response) return res;
        currentProject = res.project;
        return jsonResponse(200, res);
      }
      return jsonResponse(200, { project: currentProject });
    },
    "PATCH /api/workspaces/the-firsts/projects/TFP11": (req) => {
      const body = req?.body;
      const parsedBody =
        typeof body === "string" ? JSON.parse(body) : body;
      if (onPatchProject) {
        const res = onPatchProject(parsedBody);
        if (res instanceof Response) return res;
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
    ...customRoutes,
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

    expect(
      screen.queryByRole("button", { name: "Change cover" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change icon" }),
    ).not.toBeInTheDocument();
  });

  it("AC-11: clicking Change cover opens cover picker and selecting new cover enables submit and updates preview", async () => {
    const user = userEvent.setup();
    let patchedBody: unknown = null;

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: (body) => {
        patchedBody = body;
        return {
          project: {
            ...sampleProject,
            coverKey: "cover-02",
            updatedAt: "2026-10-12T10:05:00.000Z",
          },
        };
      },
    });

    const changeCoverBtn = await screen.findByRole("button", {
      name: "Change cover",
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });
    expect(submitBtn).toBeDisabled();

    await user.click(changeCoverBtn);

    const cover2Radio = screen.getByRole("radio", { name: "Cover 2" });
    await user.click(cover2Radio);

    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchedBody).toEqual({
        coverKey: "cover-02",
      });
    });

    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });
  });

  it("AC-12: clicking Change icon opens icon picker and selecting icon/color enables submit", async () => {
    const user = userEvent.setup();
    let patchedBody: unknown = null;

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: (body) => {
        patchedBody = body;
        return {
          project: {
            ...sampleProject,
            icon: { name: "star", color: sampleProject.icon.color },
            updatedAt: "2026-10-12T10:05:00.000Z",
          },
        };
      },
    });

    const changeIconBtn = await screen.findByRole("button", {
      name: "Change icon",
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });
    expect(submitBtn).toBeDisabled();

    await user.click(changeIconBtn);

    const starRadio = screen.getByRole("radio", { name: "star" });
    await user.click(starRadio);

    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchedBody).toEqual({
        icon: {
          name: "star",
          color: sampleProject.icon.color,
        },
      });
    });
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


  it("AC-17: timezone select shows workspace follow option, updates to Asia/Tokyo, then reverts to null", async () => {
    const user = userEvent.setup();
    const patchCalls: unknown[] = [];

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: (body) => {
        patchCalls.push(body);
        const b = body as { timezone?: string | null };
        const newTz = b.timezone !== undefined ? b.timezone : null;
        return {
          project: {
            ...sampleProject,
            timezone: newTz,
            effectiveTimezone: effectiveProjectTimezone(
              newTz,
              testWorkspace.timezone,
            ),
            updatedAt: "2026-10-12T10:05:00.000Z",
          },
        };
      },
    });

    const tzInput = await screen.findByRole("combobox", {
      name: "Project Timezone",
    });
    expect(tzInput).toBeInTheDocument();

    // Click to open dropdown
    fireEvent.click(tzInput);

    const wsOptions = screen.getAllByRole("option", {
      name: /Workspace timezone/i,
      hidden: true,
    });
    expect(wsOptions).toHaveLength(1);
    expect(wsOptions[0]?.textContent).toContain(
      "Workspace timezone · (UTC+07:00) Asia/Ho_Chi_Minh",
    );
    expect(wsOptions[0]?.textContent).not.toContain("(current)");

    // Select Asia/Tokyo
    fireEvent.change(tzInput, { target: { value: "tokyo" } });
    const tokyoOption = screen.getByRole("option", {
      name: /Asia\/Tokyo/i,
      hidden: true,
    });
    fireEvent.click(tokyoOption);

    const submitBtn = screen.getByRole("button", { name: "Update project" });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchCalls[0]).toEqual({ timezone: "Asia/Tokyo" });
    });

    // Now change back to workspace
    fireEvent.click(tzInput);
    fireEvent.change(tzInput, { target: { value: "workspace" } });
    const wsOption = screen.getByRole("option", {
      name: /Workspace timezone/i,
      hidden: true,
    });
    fireEvent.click(wsOption);

    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(patchCalls[1]).toEqual({ timezone: null });
    });
  });

  it("AC-19: Created on displays formatted date using effectiveTimezone", async () => {
    const tokyoProject: ProjectListItem = {
      ...sampleProject,
      createdAt: "2026-10-10T23:30:00.000Z",
      timezone: "Asia/Tokyo",
      effectiveTimezone: "Asia/Tokyo",
    };

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      project: tokyoProject,
    });

    expect(
      await screen.findByText("Created on Oct 11, 2026"),
    ).toBeInTheDocument();

    cleanup();

    const utcProject: ProjectListItem = {
      ...sampleProject,
      createdAt: "2026-10-10T23:30:00.000Z",
      timezone: "UTC",
      effectiveTimezone: "UTC",
    };

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      project: utcProject,
    });

    expect(
      await screen.findByText("Created on Oct 10, 2026"),
    ).toBeInTheDocument();
  });

  it("AC-37: document title reflects section and project name", async () => {
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
    });

    await waitFor(() => {
      expect(document.title).toBe("General · The First Project settings");
    });
  });

  it("AC-13: 409 PROJECT_NAME_TAKEN sets error under name input, focuses input, and saves nothing", async () => {
    const user = userEvent.setup();
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: () =>
        apiError(
          409,
          "PROJECT_NAME_TAKEN",
          "A project with this name already exists",
          {
            fields: { name: "A project with this name already exists" },
          },
        ),
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    await user.clear(nameInput);
    await user.type(nameInput, "web");

    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    expect(
      await screen.findByText("A project with this name already exists"),
    ).toBeInTheDocument();
    expect(nameInput).toHaveFocus();
  });

  it("AC-24: 403 FORBIDDEN shows permission lost, reloads project, and switches form to read-only", async () => {
    const user = userEvent.setup();
    let reloaded = false;

    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: () =>
        apiError(403, "FORBIDDEN", "Forbidden"),
      onGetProject: () => {
        if (reloaded) {
          return {
            project: {
              ...sampleProject,
              permissions: ["project.settings.view"], // lacks update perm
            },
          };
        }
        return { project: sampleProject };
      },
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    await user.type(nameInput, " Modified");
    expect(submitBtn).toBeEnabled();

    reloaded = true;
    await user.click(submitBtn);

    expect(
      await screen.findByText("You no longer have permission to change these settings."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(nameInput).toHaveAttribute("readonly");
      expect(
        screen.queryByRole("button", { name: "Update project" }),
      ).not.toBeInTheDocument();
    });
  });

  it("AC-25 & AC-51: 404 on save notifies, navigates to workspace home, and removes project from cache without extra GET", async () => {
    const user = userEvent.setup();
    const notifySpy = vi.spyOn(notifications, "show");
    let getProjectsCount = 0;

    const { router } = renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: () =>
        apiError(404, "PROJECT_NOT_FOUND", "This project doesn't exist."),
      customRoutes: {
        "GET /api/workspaces/the-firsts/projects": () => {
          getProjectsCount++;
          return jsonResponse(200, {
            projects: [sampleProject],
            total: 1,
          });
        },
      },
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    await user.type(nameInput, " Modified");
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    await waitFor(() => {
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "This project doesn't exist.",
          color: "red",
        }),
      );
      expect(router.state.location.pathname).toBe("/the-firsts");
      expect(getProjectsCount).toBe(0);
    });
  });

  it("AC-26: 429 TOO_MANY_ATTEMPTS with retryAfterSeconds displays rate limit message", async () => {
    const user = userEvent.setup();
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: () =>
        apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts", {
          retryAfterSeconds: 90,
        }),
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    await user.type(nameInput, " Modified");
    await user.click(submitBtn);

    expect(
      await screen.findByText("Too many changes. Try again in 2 minutes."),
    ).toBeInTheDocument();
  });

  it("AC-52: 400 with hidden field error displays message in alert", async () => {
    const user = userEvent.setup();
    renderProjectSettingsApp({
      initialEntries: ["/the-firsts/projects/TFP11/settings/general"],
      onPatchProject: () =>
        apiError(400, "VALIDATION_ERROR", "Invalid color format", {
          fields: { "icon.color": "Invalid color format" },
        }),
    });

    const nameInput = await screen.findByRole("textbox", {
      name: /Project name/i,
    });
    const submitBtn = screen.getByRole("button", { name: "Update project" });

    await user.type(nameInput, " Modified");
    await user.click(submitBtn);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Invalid color format");
  });
});
