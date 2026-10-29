import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { jsonResponse, mockFetch } from "../../../test/fetchMock";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { setLanguage } from "../../../i18n";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeWorkspace } from "../test/workspaceFixtures";

function renderApp(initialPath: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialPath],
  });
  const view = render(
    <AppUiProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router, ...view };
}

describe("WorkspaceShell in Vietnamese (AC-02, AC-13, INV-12, INV-15, INV-16, AC-18)", () => {
  beforeEach(() => {
    stubMatchMedia(true);
    localStorage.clear();
    setLanguage("vi");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    setLanguage("en");
  });

  it("AC-02, AC-13, INV-12: renders shell in Vietnamese while keeping 'Workspace' untranslated", async () => {
    const ws = makeWorkspace({ slug: "openplany-vn", name: "OpenPlany VN" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openplany-vn": () => jsonResponse(200, ws),
      "GET /api/workspaces/openplany-vn/projects": () =>
        jsonResponse(200, { projects: [], total: 0, truncated: false }),
    });

    renderApp("/openplany-vn");

    // Invariant INV-12: "Workspace" stays "Workspace"
    const nav = await screen.findByRole("navigation", { name: "Workspace" });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText("Workspace")).toBeInTheDocument();

    // Vietnamese navigation items
    const homeLink = within(nav).getByRole("link", { name: "Trang chủ" });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute("aria-current", "page");

    const settingsLink = within(nav).getByRole("link", { name: "Cài đặt" });
    expect(settingsLink).toBeInTheDocument();

    expect(
      within(nav).getByRole("button", { name: "Tạo công việc" }),
    ).toBeInTheDocument();

    expect(
      within(nav).getByRole("button", { name: "Thu gọn thanh bên" }),
    ).toBeInTheDocument();

    // Headers are rendered
    expect(screen.getAllByRole("banner").length).toBeGreaterThanOrEqual(1);
  });

  it("INV-15: route handle titleKey switches language dynamically between en and vi", async () => {
    const ws = makeWorkspace({ slug: "openplany-vn", name: "OpenPlany VN" });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [ws], lastWorkspaceSlug: ws.slug }),
      "GET /api/workspaces/openplany-vn": () => jsonResponse(200, ws),
      "GET /api/workspaces/openplany-vn/projects": () =>
        jsonResponse(200, { projects: [], total: 0, truncated: false }),
    });

    setLanguage("en");
    const { unmount } = renderApp("/openplany-vn");
    expect(
      await screen.findByRole("link", { name: "Home" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    unmount();

    setLanguage("vi");
    renderApp("/openplany-vn");
    expect(
      await screen.findByRole("link", { name: "Trang chủ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cài đặt" })).toBeInTheDocument();
  });

  it("INV-16, AC-18: create workspace in vi renders localized labels and sends canonical organization size", async () => {
    let capturedBody: unknown = null;
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
      "GET /api/workspaces/slug-check?slug=cong-ty-moi": () =>
        jsonResponse(200, {
          slug: "cong-ty-moi",
          available: true,
          reason: null,
        }),
      "POST /api/workspaces": (init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse(201, {
          id: "ws-new",
          slug: "cong-ty-moi",
          name: "Công ty mới",
          organizationSize: "Just myself",
          role: "ADMIN",
          memberCount: 1,
          backgroundColor: "#1890FF",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          permissions: ["workspace.projects.create"],
        });
      },
    });

    const user = userEvent.setup();
    renderApp("/create-workspace");

    expect(
      await screen.findByRole("heading", { name: "Tạo Workspace của bạn" }),
    ).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Đặt tên cho Workspace/i);
    await user.type(nameInput, "Công ty mới");

    const select = screen.getByPlaceholderText("Chọn một khoảng");
    fireEvent.click(select);
    fireEvent.click(
      screen.getByRole("option", { name: "Chỉ mình tôi", hidden: true }),
    );

    expect(await screen.findByText("✓ Khả dụng")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Tạo Workspace" });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        name: "Công ty mới",
        slug: "cong-ty-moi",
        organizationSize: "Just myself",
      });
    });
  });
});
