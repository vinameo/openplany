import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeWorkspace } from "../test/workspaceFixtures";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebarPreference";

function renderApp(initialPath: string) {
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

describe("WorkspaceShell (desktop)", () => {
  beforeEach(() => {
    stubMatchMedia(true);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("AC-01: renders Workspace sidebar, Home active, Settings link, and page header Home", async () => {
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText("Workspace")).toBeInTheDocument();

    const homeLink = within(nav).getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("aria-current", "page");

    const settingsLink = within(nav).getByRole("link", { name: "Settings" });
    expect(settingsLink).toHaveAttribute("href", "/openstudy/settings");
    expect(settingsLink).not.toHaveAttribute("aria-current");

    expect(within(nav).getByRole("button", { name: "New work item" })).toBeInTheDocument();
    expect(within(nav).getByRole("group", { name: "Projects" })).toBeInTheDocument();

    expect(screen.getByText("Home", { selector: "header *" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Expand sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("AC-02: New work item is focusable with aria-disabled, shows tooltip, clicking does not navigate", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    const { router } = renderApp("/openstudy");

    const newBtn = await screen.findByRole("button", { name: "New work item" });
    expect(newBtn).toHaveAttribute("aria-disabled", "true");
    expect(newBtn).not.toBeDisabled();

    // Focus -> tooltip
    newBtn.focus();
    expect(document.activeElement).toBe(newBtn);
    expect(await screen.findByRole("tooltip", { name: "Coming soon" })).toBeInTheDocument();

    // Click -> does not change URL
    await user.click(newBtn);
    expect(router.state.location.pathname).toBe("/openstudy");
  });

  it("AC-03: Projects group has no button or link, displays dimmed empty label", async () => {
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const projectsGroup = await screen.findByRole("group", { name: "Projects" });
    expect(projectsGroup).toBeInTheDocument();
    expect(within(projectsGroup).queryByRole("button")).not.toBeInTheDocument();
    expect(within(projectsGroup).queryByRole("link")).not.toBeInTheDocument();
    expect(within(projectsGroup).getByText("No projects yet")).toBeInTheDocument();
  });

  it("AC-04: navigating to Settings hides Workspace sidebar, Back button restores it", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    const settingsLink = within(nav).getByRole("link", { name: "Settings" });

    await user.click(settingsLink);

    // Now in Settings: Settings sidebar appears, Workspace navigation is gone
    const settingsNav = await screen.findByRole("navigation", {
      name: "Workspace settings",
    });
    expect(settingsNav).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace" }),
    ).not.toBeInTheDocument();

    // Click Back to workspace
    const backBtn = within(settingsNav).getByRole("link", {
      name: "Back to workspace",
    });
    await user.click(backBtn);

    // Workspace sidebar is restored
    expect(
      await screen.findByRole("navigation", { name: "Workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace settings" }),
    ).not.toBeInTheDocument();
  });

  it("AC-05 & AC-06: collapses and expands sidebar, updates localStorage, and manages focus", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const collapseBtn = await screen.findByRole("button", {
      name: "Collapse sidebar",
    });
    await user.click(collapseBtn);

    // After collapse:
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();

    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(document.activeElement).toBe(expandBtn);

    // Click expand
    await user.click(expandBtn);

    // After expand:
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
    expect(await screen.findByRole("link", { name: "Home" })).toBeInTheDocument();
    const newCollapseBtn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(document.activeElement).toBe(newCollapseBtn);
  });

  it("AC-07: storage 'true' before render starts collapsed without flashing links", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");

    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    await screen.findByRole("button", { name: "Expand sidebar" });
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  it("AC-08: invalid storage value defaults to open", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "abc");

    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    expect(await screen.findByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("AC-08: throwing storage defaults to open with console.warn", async () => {
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage quota exceeded or disabled");
    });

    try {
      renderApp("/openstudy");
      expect(await screen.findByRole("link", { name: "Home" })).toBeInTheDocument();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("AC-09: collapsed state persists across workspace transitions", async () => {
    const user = userEvent.setup();
    const ws1 = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    const ws2 = makeWorkspace({ id: "ws-2", slug: "math-club", name: "Math Club" });

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws1, ws2], lastWorkspaceSlug: ws1.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws1),
      "GET /api/workspaces/math-club": () => jsonResponse(200, ws2),
    });

    const { router } = renderApp("/openstudy");

    const collapseBtn = await screen.findByRole("button", {
      name: "Collapse sidebar",
    });
    await user.click(collapseBtn);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    // Navigate to ws2
    await router.navigate("/math-club");

    expect(await screen.findByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });

  it("AC-12: accessibility attributes aria-expanded and aria-controls match sidebar id", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    const sidebarId = nav.id;
    expect(sidebarId).toBeTruthy();

    const collapseBtn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");
    expect(collapseBtn).toHaveAttribute("aria-controls", sidebarId);

    await user.click(collapseBtn);

    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandBtn).toHaveAttribute("aria-expanded", "false");
    expect(expandBtn).toHaveAttribute("aria-controls", sidebarId);
  });

  it("AC-13: Admin, Member, and Guest see identical sidebar items; Guest sees read-only General settings", async () => {
    const user = userEvent.setup();
    const guestWs = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      role: "guest",
      permissions: [],
    });

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [guestWs], lastWorkspaceSlug: guestWs.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, guestWs),
    });

    renderApp("/openstudy");

    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    expect(within(nav).getByRole("link", { name: "Home" })).toBeInTheDocument();
    const settingsLink = within(nav).getByRole("link", { name: "Settings" });
    expect(settingsLink).toBeInTheDocument();

    await user.click(settingsLink);

    // Guest should see General settings in read-only form, not Access Denied
    expect(
      screen.queryByText(/access denied/i),
    ).not.toBeInTheDocument();
    const nameInput = await screen.findByLabelText(/workspace name/i);
    expect(nameInput).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("button", { name: /update workspace/i }),
    ).not.toBeInTheDocument();
  });

  it("AC-14: unknown slug renders 404 without Workspace navigation or command search", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "GET /api/workspaces/unknown-slug": () =>
        apiError(404, "NOT_FOUND", "Workspace not found"),
    });

    renderApp("/unknown-slug");

    expect(
      await screen.findByRole("heading", { name: "Workspace not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Search commands (coming soon)" }),
    ).not.toBeInTheDocument();
  });

  it("AC-18: route-level shows search commands button at /:slug and /:slug/settings, click does not navigate", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    const { router } = renderApp("/openstudy");

    const searchBtn = await screen.findByRole("button", {
      name: "Search commands (coming soon)",
    });
    expect(searchBtn).toBeInTheDocument();

    await user.click(searchBtn);
    expect(router.state.location.pathname).toBe("/openstudy");

    // Navigate to settings
    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    const settingsLink = within(nav).getByRole("link", { name: "Settings" });
    await user.click(settingsLink);

    await screen.findByRole("navigation", { name: "Workspace settings" });
    expect(
      screen.getByRole("button", { name: "Search commands (coming soon)" }),
    ).toBeInTheDocument();
  });

  it("AC-23: desktop Tab order moves predictably through header, then sidebar, with no positive tabIndex", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    await screen.findByRole("navigation", { name: "Workspace" });

    // Ensure no positive tabIndex anywhere
    const allWithTabIndex = document.querySelectorAll("[tabindex]");
    for (const el of allWithTabIndex) {
      const tabIndexVal = parseInt(el.getAttribute("tabindex") ?? "0", 10);
      expect(tabIndexVal).toBeLessThanOrEqual(0);
    }

    // Tab through header
    await user.tab();
    expect(screen.getByRole("button", { name: "Switch workspace – OpenStudy" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Search commands (coming soon)" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /switch to (dark|light) mode/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /edit profile/i })).toHaveFocus();

    // Tab into sidebar
    await user.tab();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "New work item" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Home" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
  });
});

describe("WorkspaceShell (mobile)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("AC-10: initial load has no Home link in DOM; opening shows dialog with exactly Home and Settings", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    // Initially, no Home link exists in DOM
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();

    const openBtn = await screen.findByRole("button", { name: "Open sidebar" });
    await user.click(openBtn);

    // Dialog appears
    const dialog = await screen.findByRole("dialog", { name: "Workspace" });
    expect(dialog).toBeInTheDocument();

    const homeLinks = within(dialog).getAllByRole("link", { name: "Home" });
    expect(homeLinks).toHaveLength(1);

    const settingsLinks = within(dialog).getAllByRole("link", { name: "Settings" });
    expect(settingsLinks).toHaveLength(1);

    // No other extraneous items
    expect(within(dialog).queryByText(/drafts/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/your work/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/stickies/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/more/i)).not.toBeInTheDocument();
  });

  it("AC-11: tapping Settings closes drawer; Esc closes drawer; localStorage is never touched", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const openBtn = await screen.findByRole("button", { name: "Open sidebar" });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog", { name: "Workspace" });
    const settingsLink = within(dialog).getByRole("link", { name: "Settings" });

    // Tap Settings -> drawer closes, navigates to Settings
    await user.click(settingsLink);

    await screen.findByRole("navigation", { name: "Workspace settings" });
    expect(
      screen.queryByRole("dialog", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull();

    // Now in settings, tap back to workspace
    const backBtns = await screen.findAllByRole("link", { name: "Back to workspace" });
    await user.click(backBtns[0]);

    // Back at Home, open drawer again
    const newOpenBtn = await screen.findByRole("button", { name: "Open sidebar" });
    await user.click(newOpenBtn);

    expect(await screen.findByRole("dialog", { name: "Workspace" })).toBeInTheDocument();

    // Press Escape -> closes drawer
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBeNull();
  });

  it("AC-02 (mobile): tapping New work item inside drawer shows Coming soon status and keeps drawer open", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy", name: "OpenStudy" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openstudy": () => jsonResponse(200, ws),
    });

    renderApp("/openstudy");

    const openBtn = await screen.findByRole("button", { name: "Open sidebar" });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog", { name: "Workspace" });
    const newBtn = within(dialog).getByRole("button", { name: "New work item" });
    expect(newBtn).toBeInTheDocument();

    await user.click(newBtn);

    // Coming soon status popover appears
    expect(screen.getByRole("status")).toHaveTextContent("Coming soon");
    // Drawer remains open
    expect(screen.getByRole("dialog", { name: "Workspace" })).toBeInTheDocument();
  });
});

