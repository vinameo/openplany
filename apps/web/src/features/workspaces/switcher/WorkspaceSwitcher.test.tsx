import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { WorkspaceProvider } from "../WorkspaceProvider";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const workspacesMock = [
  {
    id: "ws-1",
    name: "Acme Corp",
    slug: "acme-corp",
    logoUrl: null,
    backgroundColor: "#0F172A",
    organizationSize: "2-10" as const,
    timezone: "UTC",
    role: "owner" as const,
    permissions: ["workspace.settings.update" as const],
    memberCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ws-2",
    name: "OpenStudy",
    slug: "openstudy",
    logoUrl: null,
    backgroundColor: "#BE185D",
    organizationSize: "2-10" as const,
    timezone: "UTC",
    role: "admin" as const,
    permissions: ["workspace.settings.update" as const],
    memberCount: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function renderSwitcher(currentWorkspace = workspacesMock[0]) {
  render(
    <AppUiProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <MemoryRouter>
            <WorkspaceSwitcher currentWorkspace={currentWorkspace} />
          </MemoryRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </AppUiProvider>,
  );
  return { user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceSwitcher", () => {
  it("AC 15: opening menu shows email, current workspace with checkmark, other workspace, and actions", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: workspacesMock,
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    const { user } = renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch workspace – Acme Corp",
    });
    await user.click(trigger);

    expect(await screen.findByText("an@openplany.dev")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Corp")).toHaveLength(2);
    expect(screen.getByText("OpenStudy")).toBeInTheDocument();
    expect(screen.getByText("Owner · 1 member")).toBeInTheDocument();
    expect(screen.getByText("Admin · 5 members")).toBeInTheDocument();
    expect(screen.getByText("Create workspace")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();

    // Settings item is present with href="/acme-corp/settings", only under active workspace
    const settingsLink = screen.getByRole("menuitem", {
      name: "Settings",
      hidden: true,
    });
    expect(settingsLink).toBeInTheDocument();
    expect(settingsLink).toHaveAttribute("href", "/acme-corp/settings");

    // Verify unbuilt features are NOT present
    expect(screen.queryByText(/invite members/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/workspace invites/i)).not.toBeInTheDocument();
  });

  it("AC 16: clicking Sign out invokes sign-out flow", async () => {
    const fetchMock = mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: workspacesMock,
          lastWorkspaceSlug: "acme-corp",
        }),
      "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
    });

    const { user } = renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch workspace – Acme Corp",
    });
    await user.click(trigger);

    const signOutItem = await screen.findByText("Sign out");
    await user.click(signOutItem);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("handles very long workspace name gracefully with ellipsis truncation classes", async () => {
    const longName = "The Second Workspace 325467809876543678901234567890";
    const longWorkspaces = [
      {
        ...workspacesMock[0]!,
        name: longName,
      },
    ];

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: longWorkspaces,
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    const { user } = renderSwitcher(longWorkspaces[0]);

    const trigger = await screen.findByRole("button", {
      name: `Switch workspace – ${longName}`,
    });
    expect(trigger).toBeInTheDocument();
    await user.click(trigger);

    const items = await screen.findAllByText(longName);
    expect(items.length).toBeGreaterThan(0);
  });

  it("AC-01: hides 'Create user' menuitem when isInstanceAdmin is false", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: false },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: workspacesMock,
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    const { user } = renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch workspace – Acme Corp",
    });
    await user.click(trigger);

    expect(screen.queryByText("Create user")).not.toBeInTheDocument();
  });

  it("AC-02: shows 'Create user' between 'Create workspace' and 'Sign out' when isInstanceAdmin is true", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: workspacesMock,
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    const { user } = renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch workspace – Acme Corp",
    });
    await user.click(trigger);

    const menuItems = await screen.findAllByRole("menuitem");
    const itemTexts = menuItems.map((item) => item.textContent?.trim());

    const createWsIndex = itemTexts.findIndex((t) => t?.includes("Create workspace"));
    const createUserIndex = itemTexts.findIndex((t) => t?.includes("Create user"));
    const signOutIndex = itemTexts.findIndex((t) => t?.includes("Sign out"));

    expect(createUserIndex).toBeGreaterThan(createWsIndex);
    expect(signOutIndex).toBeGreaterThan(createUserIndex);
  });

  it("AC-18: clicking 'Create user' item navigates to /create-user", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "GET /api/workspaces": () =>
        jsonResponse(200, {
          workspaces: workspacesMock,
          lastWorkspaceSlug: "acme-corp",
        }),
    });

    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <WorkspaceSwitcher currentWorkspace={workspacesMock[0]} />,
        },
        {
          path: "/create-user",
          element: <div>Create User Page</div>,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(
      <AppUiProvider>
        <AuthProvider>
          <WorkspaceProvider>
            <RouterProvider router={router} />
          </WorkspaceProvider>
        </AuthProvider>
      </AppUiProvider>,
    );

    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", {
      name: "Switch workspace – Acme Corp",
    });
    await user.click(trigger);

    const createUserItem = await screen.findByText("Create user");
    await user.click(createUserItem);

    expect(router.state.location.pathname).toBe("/create-user");
  });
});
