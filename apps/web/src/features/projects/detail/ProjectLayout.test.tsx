import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem, ProjectResponse } from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { makeWorkspace } from "../../workspaces/test/workspaceFixtures";

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
  description: "Description",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-12T10:00:00.000Z",
  members: [],
  memberCount: 0,
  role: "admin",
  permissions: ["project.members.view"],
};

function renderProjectApp({
  initialEntries = ["/the-firsts/projects/TFP11"],
  projectResponse = { project: sampleProject },
  projectError,
  delayProject,
}: {
  initialEntries?: string[];
  projectResponse?: ProjectResponse | null;
  projectError?: { status: number; code: string; message: string };
  delayProject?: Promise<void>;
} = {}) {
  stubMatchMedia(true);
  const router = createMemoryRouter(appRoutes, {
    initialEntries,
  });

  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces: [testWorkspace],
        lastWorkspaceSlug: "the-firsts",
      }),
    "GET /api/workspaces/the-firsts": () => jsonResponse(200, testWorkspace),
    "GET /api/workspaces/the-firsts/projects/TFP11": async () => {
      if (delayProject) {
        await delayProject;
      }
      if (projectError) {
        return jsonResponse(projectError.status, {
          code: projectError.code,
          message: projectError.message,
        });
      }
      if (!projectResponse) {
        return jsonResponse(404, {
          code: "PROJECT_NOT_FOUND",
          message: "This project doesn't exist.",
        });
      }
      return jsonResponse(200, projectResponse);
    },
    "GET /api/workspaces/the-firsts/projects": () =>
      jsonResponse(200, {
        projects: [sampleProject],
        total: 1,
        truncated: false,
      }),
  });

  render(
    <AppUiProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { router, fetchMock };
}

describe("ProjectLayout (Ticket 04 tracer bullet)", () => {
  beforeEach(() => {
    document.title = "OpenPlany";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("AC-01 & AC-04: renders project shell with minimal sidebar, breadcrumb, and tab title (AC-22)", async () => {
    renderProjectApp();
    // Sidebar: "Project" title and "Home" link
    expect(await screen.findByText("Project")).toBeInTheDocument();
    const homeNavLink = screen.getByRole("link", { name: "Home" });
    expect(homeNavLink).toBeInTheDocument();
    expect(homeNavLink).toHaveAttribute("aria-current", "page");
    expect(homeNavLink).toHaveAttribute(
      "href",
      "/the-firsts/projects/TFP11",
    );

    // Sidebar collapse button
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();

    // Breadcrumb on desktop
    const breadcrumbNav = screen.getByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(breadcrumbNav).toBeInTheDocument();

    const wsLink = screen.getByRole("link", { name: "The Firsts" });
    expect(wsLink).toHaveAttribute("href", "/the-firsts");

    const projectLink = await screen.findByRole("link", {
      name: /The First Project/i,
    });
    expect(projectLink).toHaveAttribute(
      "href",
      "/the-firsts/projects/TFP11",
    );

    // Current page in breadcrumb
    const homeBreadcrumb = screen.getByText("Home", { selector: "p" });
    expect(homeBreadcrumb).toHaveAttribute("aria-current", "page");

    // Tab title
    expect(document.title).toBe("The First Project · The Firsts");
  });

  it("shows skeleton while loading project and does not set project title yet", async () => {
    let resolveProject!: () => void;
    const delay = new Promise<void>((resolve) => {
      resolveProject = resolve;
    });

    renderProjectApp({ delayProject: delay });

    // Workspace is loaded, shell is rendered
    expect(await screen.findByText("Project")).toBeInTheDocument();

    // Breadcrumb skeleton is present
    expect(
      screen.getByLabelText("Loading project"),
    ).toBeInTheDocument();

    // Title has not changed to project title yet
    expect(document.title).not.toContain("The First Project");

    // Resolve project fetch
    resolveProject();

    // Now project name appears and title changes
    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();
    expect(document.title).toBe("The First Project · The Firsts");
  });

  it("AC-10: breadcrumb links navigate to workspace home and project home", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp();

    // Wait for project link to be ready
    await screen.findByRole("link", { name: /The First Project/i });

    // Click workspace link in breadcrumb
    const wsLink = screen.getByRole("link", { name: "The Firsts" });
    await user.click(wsLink);

    // Router should navigate to /the-firsts
    expect(router.state.location.pathname).toBe("/the-firsts");
  });

  it("AC-01: clicking project from workspace Home table navigates to project page", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp({
      initialEntries: ["/the-firsts"],
    });

    // Wait for projects table
    const projectLink = await screen.findByRole("link", {
      name: /The First Project/i,
    });
    expect(projectLink).toHaveAttribute(
      "href",
      "/the-firsts/projects/TFP11",
    );

    // Click project link
    await user.click(projectLink);

    // Navigated to /the-firsts/projects/TFP11
    expect(router.state.location.pathname).toBe(
      "/the-firsts/projects/TFP11",
    );
    expect(await screen.findByText("Project")).toBeInTheDocument();
    expect(document.title).toBe("The First Project · The Firsts");
  });

  it("AC-14: renders standalone 403 Forbidden page without header or sidebar", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp({
      projectError: {
        status: 403,
        code: "FORBIDDEN",
        message: "You don't have access to this project.",
      },
    });

    // Heading and messages
    expect(
      await screen.findByRole("heading", { name: "Forbidden", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You don't have access to this project."),
    ).toBeInTheDocument();
    expect(screen.getByText("403")).toHaveAttribute("aria-hidden", "true");

    // Standalone page: NO header (banner), NO project nav or workspace nav
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();

    // Tab title
    expect(document.title).toBe("Forbidden · OpenPlany");

    // Homepage link
    const homepageBtn = screen.getByRole("link", { name: "Homepage" });
    expect(homepageBtn).toHaveAttribute("href", "/the-firsts");

    await user.click(homepageBtn);
    expect(router.state.location.pathname).toBe("/the-firsts");
  });

  it("AC-13, AC-17 & AC-21: renders standalone 404 Not Found page without header or sidebar", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp({
      projectError: {
        status: 404,
        code: "PROJECT_NOT_FOUND",
        message: "This project doesn't exist.",
      },
    });

    // Heading and messages
    expect(
      await screen.findByRole("heading", { name: "Not Found", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This project doesn't exist."),
    ).toBeInTheDocument();
    expect(screen.getByText("404")).toHaveAttribute("aria-hidden", "true");

    // Standalone page: NO header, NO sidebar
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Workspace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();

    // Tab title
    expect(document.title).toBe("Not found · OpenPlany");

    // Homepage link
    const homepageBtn = screen.getByRole("link", { name: "Homepage" });
    expect(homepageBtn).toHaveAttribute("href", "/the-firsts");

    await user.click(homepageBtn);
    expect(router.state.location.pathname).toBe("/the-firsts");
  });
});
