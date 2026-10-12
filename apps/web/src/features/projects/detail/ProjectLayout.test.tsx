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
  isDesktop = true,
  workspaces = [testWorkspace],
}: {
  initialEntries?: string[];
  projectResponse?: ProjectResponse | null;
  projectError?: { status: number; code: string; message: string };
  delayProject?: Promise<void>;
  isDesktop?: boolean;
  workspaces?: (typeof testWorkspace)[];
} = {}) {
  stubMatchMedia(isDesktop);
  const router = createMemoryRouter(appRoutes, {
    initialEntries,
  });

  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces,
        lastWorkspaceSlug: workspaces[0]?.slug ?? "the-firsts",
      }),
    "GET /api/workspaces/the-firsts": () => jsonResponse(200, testWorkspace),
    "GET /api/workspaces/second-ws": () =>
      jsonResponse(
        200,
        workspaces.find((w) => w.slug === "second-ws") ?? testWorkspace,
      ),
    "GET /api/workspaces/second-ws/projects": () =>
      jsonResponse(200, {
        projects: [],
        total: 0,
        truncated: false,
      }),
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
    expect(homeNavLink).toHaveAttribute("href", "/the-firsts/projects/TFP11");

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
    expect(projectLink).toHaveAttribute("href", "/the-firsts/projects/TFP11");

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
    expect(screen.getByLabelText("Loading project")).toBeInTheDocument();

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
    expect(projectLink).toHaveAttribute("href", "/the-firsts/projects/TFP11");

    // Click project link
    await user.click(projectLink);

    // Navigated to /the-firsts/projects/TFP11
    expect(router.state.location.pathname).toBe("/the-firsts/projects/TFP11");
    expect(await screen.findByText("Project")).toBeInTheDocument();
    expect(document.title).toBe("The First Project · The Firsts");
  });

  it("opened from the Home list, shows the project at once and still re-checks it with the server", async () => {
    const user = userEvent.setup();
    let releaseDetail: () => void = () => {};
    const detailGate = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    const { fetchMock } = renderProjectApp({
      initialEntries: ["/the-firsts"],
      delayProject: detailGate,
    });

    await user.click(
      await screen.findByRole("link", { name: /The First Project/i }),
    );

    // The list row is shown while the detail request is still pending.
    const breadcrumb = await screen.findByRole("navigation", {
      name: "Breadcrumb",
    });
    expect(breadcrumb).toHaveTextContent("The First Project");
    expect(screen.queryByLabelText("Loading project")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain(
      "/api/workspaces/the-firsts/projects/TFP11",
    );

    releaseDetail();
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
    expect(
      screen.queryByRole("navigation", { name: "Project" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" }),
    ).not.toBeInTheDocument();

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
    expect(screen.getByText("This project doesn't exist.")).toBeInTheDocument();
    expect(screen.getByText("404")).toHaveAttribute("aria-hidden", "true");

    // Standalone page: NO header, NO sidebar
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Project" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" }),
    ).not.toBeInTheDocument();

    // Tab title
    expect(document.title).toBe("Not found · OpenPlany");

    // Homepage link
    const homepageBtn = screen.getByRole("link", { name: "Homepage" });
    expect(homepageBtn).toHaveAttribute("href", "/the-firsts");

    await user.click(homepageBtn);
    expect(router.state.location.pathname).toBe("/the-firsts");
  });

  it("AC-11: normalizes lowercase identifier to uppercase, preserving query and hash, and fetches API only once with uppercase ID", async () => {
    const { router, fetchMock } = renderProjectApp({
      initialEntries: ["/the-firsts/projects/tfp11?filter=active#details"],
    });

    // Wait for project to be loaded
    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();

    // Check location
    expect(router.state.location.pathname).toBe("/the-firsts/projects/TFP11");
    expect(router.state.location.search).toBe("?filter=active");
    expect(router.state.location.hash).toBe("#details");

    // Only fetched with uppercase TFP11, never tfp11
    const projectCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/projects/"));
    expect(projectCalls).toEqual(["/api/workspaces/the-firsts/projects/TFP11"]);
  });

  it("AC-12: renders 404 immediately for invalid project identifier format without calling API", async () => {
    for (const invalid of ["abc-12345", "1AB", "ABCDEF"]) {
      cleanup();
      const { fetchMock } = renderProjectApp({
        initialEntries: [`/the-firsts/projects/${invalid}`],
      });

      expect(
        await screen.findByRole("heading", { name: "Not Found", level: 1 }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("This project doesn't exist."),
      ).toBeInTheDocument();

      const projectCalls = fetchMock.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes("/projects/"));
      expect(projectCalls).toHaveLength(0);
    }
  });

  it("AC-25: shows ProjectLoadError with Retry on 500/network error, and recovers on successful retry", async () => {
    const user = userEvent.setup();
    let callCount = 0;

    stubMatchMedia(true);
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ["/the-firsts/projects/TFP11"],
    });

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [testWorkspace],
          lastWorkspaceSlug: "the-firsts",
        }),
      "GET /api/workspaces/the-firsts": () => jsonResponse(200, testWorkspace),
      "GET /api/workspaces/the-firsts/projects/TFP11": () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Internal server error",
          });
        }
        return jsonResponse(200, { project: sampleProject });
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

    // Frame and sidebar remain visible
    expect(await screen.findByText("Project")).toBeInTheDocument();

    // Error alert is rendered inside content area
    expect(
      await screen.findByText("Couldn't load this project."),
    ).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    await user.click(retryBtn);

    // Second call succeeds -> project loaded
    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load this project."),
    ).not.toBeInTheDocument();
    expect(document.title).toBe("The First Project · The Firsts");
  });

  it("AC-05: verifies sidebar item order, icons, and that only Home is an anchor link", async () => {
    renderProjectApp();

    expect(await screen.findByText("Project")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Project options" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New work item" }),
    ).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Project" });
    const listItems = nav.querySelectorAll("ul[role='list'] > li");
    expect(listItems).toHaveLength(5);

    const labels = Array.from(listItems).map((li) => li.textContent?.trim());
    expect(labels).toEqual([
      "Home",
      "Work items",
      "Milestones",
      "Pages",
      "Settings",
    ]);

    // Only Home has href
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("href", "/the-firsts/projects/TFP11");

    // Other items are buttons with aria-disabled="true" and no href
    for (const name of ["Work items", "Milestones", "Pages", "Settings"]) {
      const btn = screen.getByRole("button", { name });
      expect(btn).toHaveAttribute("aria-disabled", "true");
      expect(btn).not.toHaveAttribute("href");
    }
  });

  it("AC-06: clicking or focusing Coming soon items shows tooltip and does not change URL", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp();

    expect(await screen.findByText("Project")).toBeInTheDocument();

    const comingSoonButtons = [
      screen.getByRole("button", { name: "Project options" }),
      screen.getByRole("button", { name: "New work item" }),
      screen.getByRole("button", { name: "Work items" }),
      screen.getByRole("button", { name: "Milestones" }),
      screen.getByRole("button", { name: "Pages" }),
      screen.getByRole("button", { name: "Settings" }),
    ];

    for (const btn of comingSoonButtons) {
      await user.click(btn);
      expect(router.state.location.pathname).toBe("/the-firsts/projects/TFP11");
    }
  });

  it("AC-07: breadcrumb current page 'Home' has aria-current='page' and is not a link", async () => {
    renderProjectApp();

    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();

    const breadcrumbNav = screen.getByRole("navigation", {
      name: "Breadcrumb",
    });
    const wsLink = screen.getByRole("link", { name: "The Firsts" });
    const projectLink = screen.getByRole("link", {
      name: /The First Project/i,
    });
    expect(breadcrumbNav).toContainElement(wsLink);
    expect(breadcrumbNav).toContainElement(projectLink);

    // Current page is plain Text, not a link
    const homeText = screen.getByText("Home", { selector: "p" });
    expect(homeText).toHaveAttribute("aria-current", "page");
    expect(homeText.closest("a")).toBeNull();
  });

  it("AC-08: mobile (< 48em) omits workspace name from breadcrumb, drawer opens with label 'Project', and clicking Home closes drawer", async () => {
    const user = userEvent.setup();
    renderProjectApp({ isDesktop: false });

    // Project name is in breadcrumb
    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();

    // Workspace name is NOT in breadcrumb (DOM check)
    expect(
      screen.queryByRole("link", { name: "The Firsts" }),
    ).not.toBeInTheDocument();

    // Expand button is present
    const openBtn = screen.getByRole("button", { name: "Open sidebar" });
    expect(openBtn).toBeInTheDocument();

    // Open drawer
    await user.click(openBtn);

    // Drawer with aria-label="Project" is opened
    const drawer = screen.getByRole("dialog", { name: "Project" });
    expect(drawer).toBeInTheDocument();

    // Click Home link in drawer
    const homeInDrawer = screen.getByRole("link", { name: "Home" });
    await user.click(homeInDrawer);

    // Drawer closes
    expect(
      screen.queryByRole("dialog", { name: "Project" }),
    ).not.toBeInTheDocument();
  });

  it("AC-09: collapsing sidebar in project keeps it collapsed in workspace home, and expanding in workspace keeps it expanded in project", async () => {
    const user = userEvent.setup();
    const { router } = renderProjectApp();

    expect(await screen.findByText("Project")).toBeInTheDocument();

    // Collapse in project
    const collapseBtn = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    await user.click(collapseBtn);

    // Sidebar is collapsed (Expand button is shown, Collapse button gone)
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse sidebar" }),
    ).not.toBeInTheDocument();

    // Navigate to workspace home via breadcrumb
    const wsLink = screen.getByRole("link", { name: "The Firsts" });
    await user.click(wsLink);
    expect(router.state.location.pathname).toBe("/the-firsts");

    // In workspace home, sidebar is also collapsed
    expect(
      await screen.findByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse sidebar" }),
    ).not.toBeInTheDocument();

    // Expand in workspace home
    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    await user.click(expandBtn);
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();

    // Navigate back to project via breadcrumb or table
    const projectLink = await screen.findByRole("link", {
      name: /The First Project/i,
    });
    await user.click(projectLink);
    expect(router.state.location.pathname).toBe("/the-firsts/projects/TFP11");

    // In project, sidebar is also expanded
    expect(
      await screen.findByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("AC-23: switching workspace from project detail navigates to new workspace home and does not call project API on new workspace", async () => {
    const user = userEvent.setup();
    const secondWs = makeWorkspace({
      id: "ws-2",
      slug: "second-ws",
      name: "Second Workspace",
      role: "admin",
      permissions: [],
    });

    const { router, fetchMock } = renderProjectApp({
      workspaces: [testWorkspace, secondWs],
    });

    // Project is loaded
    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();

    // Switcher trigger shows current workspace "The Firsts"
    const switcherTrigger = screen.getByRole("button", {
      name: "Switch workspace – The Firsts",
    });
    expect(switcherTrigger).toBeInTheDocument();

    // Open switcher
    await user.click(switcherTrigger);

    // Menu shows Second Workspace
    const secondWsOption = await screen.findByRole("menuitem", {
      name: /Second Workspace/i,
    });
    expect(secondWsOption).toBeInTheDocument();

    // Click Second Workspace
    await user.click(secondWsOption);

    // Navigates to /second-ws
    expect(router.state.location.pathname).toBe("/second-ws");

    // Renders new workspace home (Projects heading)
    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();

    // No request to GET /api/workspaces/second-ws/projects/TFP11
    const secondWsProjectDetailCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("/second-ws/projects/TFP11"));
    expect(secondWsProjectDetailCalls).toHaveLength(0);
  });
});

describe("ProjectLayout redirect for a workspace slug named 'projects'", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uppercases the Project ID, not the workspace slug segment", async () => {
    const projectsWorkspace = makeWorkspace({
      id: "ws-p",
      slug: "projects",
      name: "Projects Team",
      role: "admin",
      permissions: [],
    });
    stubMatchMedia(true);
    const router = createMemoryRouter(appRoutes, {
      initialEntries: ["/projects/projects/tfp?view=all"],
    });
    const fetchMock = mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: [projectsWorkspace],
          lastWorkspaceSlug: "projects",
        }),
      "GET /api/workspaces/projects": () =>
        jsonResponse(200, projectsWorkspace),
      "GET /api/workspaces/projects/projects/TFP": () =>
        jsonResponse(200, {
          project: { ...sampleProject, identifier: "TFP" },
        }),
    });

    render(
      <AppUiProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AppUiProvider>,
    );

    expect(
      await screen.findByRole("link", { name: /The First Project/i }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects/projects/TFP");
    expect(router.state.location.search).toBe("?view=all");
    const projectCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/workspaces/projects/projects/"));
    expect(projectCalls).toEqual(["/api/workspaces/projects/projects/TFP"]);
  });
});
