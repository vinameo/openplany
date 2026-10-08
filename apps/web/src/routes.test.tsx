import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./features/auth/AuthProvider";
import { appRoutes } from "./routes";
import { makeSession } from "./test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "./test/fetchMock";

const signedOut = () => apiError(401, "UNAUTHENTICATED", "Sign in to continue");

function renderApp(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
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

describe("app routes", () => {
  it("shows the sign-in form when nobody is signed in", async () => {
    mockFetch({ "GET /api/auth/session": signedOut });

    renderApp("/sign-in");

    expect(
      await screen.findByRole("heading", { name: "Sign in to OpenPlany" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Sign in · OpenPlany");
  });

  it("sends an existing session straight into the app without the form", async () => {
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
    });

    const { router } = renderApp("/sign-in");

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("redirects anonymous visitors of the app to sign-in", async () => {
    mockFetch({ "GET /api/auth/session": signedOut });

    const { router } = renderApp("/");

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
  });

  it("signs in and lands on the home page", async () => {
    mockFetch({
      "GET /api/auth/session": signedOut,
      "POST /api/auth/sign-in": () => jsonResponse(200, makeSession()),
    });
    const { user, router } = renderApp("/sign-in");

    await user.type(await screen.findByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "Secret123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", {
        name: "You're not in a workspace yet",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("sends a reset-only session to the set-password screen", async () => {
    mockFetch({
      "GET /api/auth/session": signedOut,
      "POST /api/auth/sign-in": () =>
        jsonResponse(200, makeSession({ requiresPasswordReset: true })),
    });
    const { user, router } = renderApp("/sign-in");

    await user.type(await screen.findByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "Secret123!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Set a new password" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/set-password");
  });

  it("keeps a reset-only session out of the app", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(200, makeSession({ requiresPasswordReset: true })),
    });

    const { router } = renderApp("/");

    expect(
      await screen.findByRole("heading", { name: "Set a new password" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/set-password");
  });

  it("shows a verification banner for an unverified email", async () => {
    const session = makeSession();
    session.user.isEmailVerified = false;
    mockFetch({ "GET /api/auth/session": () => jsonResponse(200, session) });

    renderApp("/");

    expect(await screen.findByText("Verify your email")).toBeInTheDocument();
  });

  it("signs out back to the sign-in screen", async () => {
    const fetchMock = mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, makeSession()),
      "POST /api/auth/sign-out": () => new Response(null, { status: 204 }),
    });
    const { user, router } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
