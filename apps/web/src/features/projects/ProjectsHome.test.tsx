import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import type { ProjectListItem, ProjectListResponse } from "@repo/contracts";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { appRoutes } from "../../routes";
import { makeSession } from "../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../test/fetchMock";
import { makeWorkspace } from "../workspaces/test/workspaceFixtures";

const testWorkspace = makeWorkspace({
  id: "ws-1",
  slug: "acme",
  name: "Acme Corp",
  timezone: "Asia/Ho_Chi_Minh",
  role: "admin",
  permissions: [],
});

const sampleProject: ProjectListItem = {
  id: "p-1",
  name: "Frontend Redesign",
  identifier: "FED",
  description: "Modernizing UI",
  icon: { name: "square-check", color: "#1A2B3C" },
  coverKey: "cover-01",
  createdAt: "2026-10-11T10:00:00.000Z",
  updatedAt: "2026-10-11T10:00:00.000Z",
  timezone: null,
  effectiveTimezone: "Asia/Ho_Chi_Minh",
  members: [
    {
      userId: "u-1",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "Kai Tran",
      email: "kai@openplany.dev",
      accountActive: true,
    },
  ],
  memberCount: 1,
  role: "admin",
  permissions: ["project.members.view"],
};

function renderHomeApp(
  fetchHandlers: Record<string, () => Response | Promise<Response>>,
) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/acme"],
  });

  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    "GET /api/workspaces": () =>
      jsonResponse(200, {
        workspaces: [testWorkspace],
        lastWorkspaceSlug: "acme",
      }),
    "GET /api/workspaces/acme": () => jsonResponse(200, testWorkspace),
    ...fetchHandlers,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectsHome", () => {
  it("renders loading skeletons initially", async () => {
    // Keep list request pending forever
    renderHomeApp({
      "GET /api/workspaces/acme/projects": () =>
        new Promise<Response>(() => {}),
    });

    expect(
      await screen.findByRole("button", {
        name: /Switch workspace – Acme Corp/i,
      }),
    ).toBeInTheDocument();
    // Skeleton elements are rendered
    const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders error alert and retries when clicking Retry button", async () => {
    const user = userEvent.setup();
    let attempts = 0;

    renderHomeApp({
      "GET /api/workspaces/acme/projects": () => {
        attempts++;
        if (attempts === 1) {
          return apiError(500, "INTERNAL_ERROR", "Server exploded");
        }
        return jsonResponse(200, {
          projects: [sampleProject],
          total: 1,
          truncated: false,
        } satisfies ProjectListResponse);
      },
    });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load projects.")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);

    expect(await screen.findByText("Frontend Redesign")).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("renders empty state when user has no projects", async () => {
    renderHomeApp({
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [],
          total: 0,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      screen.getByText("You haven't been added to any projects yet."),
    ).toBeInTheDocument();
  });

  it("renders 3 columns table with formatted date according to workspace timezone", async () => {
    renderHomeApp({
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject],
          total: 1,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    // Headers
    expect(
      screen.getByRole("columnheader", { name: "Project Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Members" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Created Date" }),
    ).toBeInTheDocument();

    // Project Name link and ID
    const projectLink = screen.getByRole("link", {
      name: /Frontend Redesign/i,
    });
    expect(projectLink).toHaveAttribute("href", "/acme/projects/FED");
    expect(projectLink).not.toHaveTextContent("FED");
    expect(screen.getByText("FED")).toBeInTheDocument();

    // Member Avatar
    expect(
      screen.getByRole("button", { name: /Kai Tran/ }),
    ).toBeInTheDocument();

    // Created Date in Asia/Ho_Chi_Minh: 2026-10-11T10:00:00Z -> Oct 11, 2026
    expect(screen.getByText("Oct 11, 2026")).toBeInTheDocument();
  });

  it("renders empty state with Add project button when user has workspace.projects.create", async () => {
    const wsWithCreate = {
      ...testWorkspace,
      permissions: ["workspace.projects.create"],
    };
    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, wsWithCreate),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [],
          total: 0,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create a project to start tracking work."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Add project" }).length,
    ).toBeGreaterThan(0);
  });

  it("AC-03: hides Add project button when viewer lacks workspace.projects.create", async () => {
    const wsWithoutCreate = { ...testWorkspace, permissions: [] };
    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, wsWithoutCreate),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject],
          total: 1,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add project" }),
    ).not.toBeInTheDocument();
  });

  it("AC-23: creating a project prepends row to table and increments total badge", async () => {
    const user = userEvent.setup();
    const wsWithCreate = {
      ...testWorkspace,
      permissions: ["workspace.projects.create"],
    };

    const newCreatedProject: ProjectListItem = {
      id: "p-new",
      name: "Brand New App",
      identifier: "BNA",
      description: "",
      icon: { name: "rocket", color: "#15AABF" },
      coverKey: "cover-01",
      createdAt: "2026-10-11T15:00:00.000Z",
      updatedAt: "2026-10-11T15:00:00.000Z",
      timezone: null,
      effectiveTimezone: "Asia/Ho_Chi_Minh",
      members: [],
      memberCount: 0,
      role: "admin",
      permissions: ["project.members.view"],
    };

    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, wsWithCreate),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject],
          total: 1,
          truncated: false,
        } satisfies ProjectListResponse),
      "POST /api/workspaces/acme/projects": () =>
        jsonResponse(201, { project: newCreatedProject }),
    });

    expect(
      await screen.findByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: "Add project" });
    await user.click(addBtn);

    // Modal is opened
    expect(
      await screen.findByRole("heading", { name: "Create project" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Project name"), "Brand New App");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    // Modal closes and new project is rendered at top
    expect(await screen.findByText("Brand New App")).toBeInTheDocument();
    expect(screen.getByText("BNA")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("AC-17: searching filters table rows while keeping the badge total intact", async () => {
    const user = userEvent.setup();
    const secondProject: ProjectListItem = {
      ...sampleProject,
      id: "p-2",
      name: "Backend Service",
      identifier: "BES",
      createdAt: "2026-10-10T10:00:00.000Z",
    };

    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, testWorkspace),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject, secondProject],
          total: 2,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(await screen.findByText("Frontend Redesign")).toBeInTheDocument();
    expect(screen.getByText("Backend Service")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox", {
      name: "Search projects",
    });
    await user.type(searchInput, "Frontend");

    expect(screen.getByText("Frontend Redesign")).toBeInTheDocument();
    expect(screen.queryByText("Backend Service")).not.toBeInTheDocument();
    // Badge remains initial total 2
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows 'No projects match' and Clear search button resets query and focuses search input", async () => {
    const user = userEvent.setup();
    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, testWorkspace),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject],
          total: 1,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(await screen.findByText("Frontend Redesign")).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox", {
      name: "Search projects",
    });
    await user.type(searchInput, "unknown keyword");

    expect(
      screen.getByText('No projects match "unknown keyword"'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Frontend Redesign")).not.toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear search" });
    await user.click(clearBtn);

    expect(searchInput).toHaveValue("");
    expect(searchInput).toHaveFocus();
    expect(screen.getByText("Frontend Redesign")).toBeInTheDocument();
  });

  it("AC-18: sorts by Project Name when sort option changed", async () => {
    const user = userEvent.setup();
    const secondProject: ProjectListItem = {
      ...sampleProject,
      id: "p-2",
      name: "Alpha Project",
      identifier: "ALP",
      createdAt: "2026-10-09T10:00:00.000Z",
    };

    renderHomeApp({
      "GET /api/workspaces/acme": () => jsonResponse(200, testWorkspace),
      "GET /api/workspaces/acme/projects": () =>
        jsonResponse(200, {
          projects: [sampleProject, secondProject],
          total: 2,
          truncated: false,
        } satisfies ProjectListResponse),
    });

    expect(await screen.findByText("Frontend Redesign")).toBeInTheDocument();
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();

    // Default is createdAt desc -> sampleProject (Oct 11) comes before secondProject (Oct 09)
    let rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Frontend Redesign");
    expect(rows[2]).toHaveTextContent("Alpha Project");

    // Click sort by Project Name -> Ascending
    const sortBtn = screen.getByRole("button", {
      name: "Sort by Project Name",
    });
    await user.click(sortBtn);
    const ascOption = await screen.findByRole("menuitem", {
      name: "Ascending",
    });
    await user.click(ascOption);

    rows = screen.getAllByRole("row");
    // "Alpha Project" should now be before "Frontend Redesign"
    expect(rows[1]).toHaveTextContent("Alpha Project");
    expect(rows[2]).toHaveTextContent("Frontend Redesign");
  });
});
