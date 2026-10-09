import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";

function renderRoute() {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/create-workspace"],
  });
  render(
    <AppUiProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppUiProvider>,
  );
  return { router, user: userEvent.setup() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function adminSession() {
  return makeSession({
    user: { ...makeSession().user, isInstanceAdmin: true },
  });
}

describe("CreateWorkspaceRoute", () => {
  it("redirects to / when user is not an instance admin", async () => {
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

    const { router } = renderRoute();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("AC 8: successful creation (201) navigates to /:slug and updates workspace provider", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, adminSession()),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "GET /api/workspaces/slug-check?slug=acme-corp": () =>
        jsonResponse(200, { slug: "acme-corp", available: true, reason: null }),
      "POST /api/workspaces": () =>
        jsonResponse(201, {
          id: "ws-new-1",
          name: "Acme Corporation",
          slug: "acme-corp",
          logoUrl: null,
          backgroundColor: "#1D4ED8",
          organizationSize: "2-10",
          timezone: "UTC",
          role: "owner",
          memberCount: 1,
          createdAt: new Date().toISOString(),
        }),
      "GET /api/workspaces/acme-corp": () =>
        jsonResponse(200, {
          id: "ws-new-1",
          name: "Acme Corporation",
          slug: "acme-corp",
          logoUrl: null,
          backgroundColor: "#1D4ED8",
          organizationSize: "2-10",
          timezone: "UTC",
          role: "owner",
          memberCount: 1,
          createdAt: new Date().toISOString(),
        }),
    });

    const { user, router } = renderRoute();

    await user.type(
      await screen.findByLabelText(/name your workspace/i),
      "Acme Corporation",
    );

    const select = screen.getByPlaceholderText("Select a range");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "2-10", hidden: true }));

    const submitBtn = screen.getByRole("button", { name: "Create workspace" });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/acme-corp");
    });
  });

  it("handles 409 conflict and 429 rate limit responses gracefully", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, adminSession()),
      "GET /api/workspaces/slug-check?slug=acme-conflict": () =>
        jsonResponse(200, {
          slug: "acme-conflict",
          available: true,
          reason: null,
        }),
      "POST /api/workspaces": () =>
        apiError(409, "SLUG_ALREADY_EXISTS", "This URL is already taken. Choose another one.", {
          fields: { slug: "This URL is already taken. Choose another one." },
        }),
    });

    const { user } = renderRoute();

    await user.type(
      await screen.findByLabelText(/name your workspace/i),
      "Acme Conflict",
    );

    const select = screen.getByPlaceholderText("Select a range");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "2-10", hidden: true }));

    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      await screen.findByText("This URL is already taken. Choose another one."),
    ).toBeInTheDocument();
  });

  it("handles 429 rate limit with minutes countdown alert", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, adminSession()),
      "GET /api/workspaces/slug-check?slug=rate-limited": () =>
        jsonResponse(200, {
          slug: "rate-limited",
          available: true,
          reason: null,
        }),
      "POST /api/workspaces": () =>
        apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts", {
          retryAfterSeconds: 300,
        }),
    });

    const { user } = renderRoute();

    await user.type(
      await screen.findByLabelText(/name your workspace/i),
      "Rate Limited",
    );

    const select = screen.getByPlaceholderText("Select a range");
    fireEvent.click(select);
    fireEvent.click(screen.getByRole("option", { name: "2-10", hidden: true }));

    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(
      await screen.findByText(/You've created several workspaces recently. Try again in 5 minutes./i),
    ).toBeInTheDocument();
  });

  it("Go back navigates to / when opened without prior history", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, adminSession()),
    });

    const { user, router } = renderRoute();

    const goBackBtn = await screen.findByRole("button", { name: "Go back" });
    await user.click(goBackBtn);

    expect(router.state.location.pathname).toBe("/");
  });
});
