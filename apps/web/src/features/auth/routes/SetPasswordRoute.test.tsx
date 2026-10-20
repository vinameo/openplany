import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications } from "@mantine/notifications";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "../../../routes";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { AuthProvider } from "../AuthProvider";
import { SET_PASSWORD_PATH } from "../sessionDestination";

function renderRoute() {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [SET_PASSWORD_PATH],
  });
  render(
    <AppUiProvider>
      <Notifications />
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

describe("SetPasswordRoute", () => {
  it("AC-10: reset-only session sees password change form and back to sign in button", async () => {
    const session = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
    });

    renderRoute();

    expect(
      await screen.findByRole("heading", { name: "Set a new password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your password has to be changed before you continue."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter your current password, then choose a new one."),
    ).toBeInTheDocument();

    expect(screen.getByLabelText("Current password *")).toBeInTheDocument();
    expect(screen.getByLabelText("New password *")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password *")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save new password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to sign in" }),
    ).toBeInTheDocument();
  });

  it("redirects non-reset-only session to /", async () => {
    const session = makeSession({ requiresPasswordReset: false });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
    });

    const { router } = renderRoute();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("redirects anonymous session to /sign-in", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        apiError(401, "UNAUTHENTICATED", "No session"),
    });

    const { router } = renderRoute();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
  });

  it("validates fields on blur and required checks", async () => {
    const session = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
    });

    const { user } = renderRoute();

    const currentInput = await screen.findByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");

    // Empty current password on blur
    await user.click(currentInput);
    await user.tab();
    expect(
      await screen.findByText("Enter your current password"),
    ).toBeInTheDocument();

    // Type new password equal to email
    await user.type(newInput, "an@openplany.dev");
    await user.tab();
    expect(
      await screen.findByText("Password can't be the same as the email"),
    ).toBeInTheDocument();

    // Type short new password
    await user.clear(newInput);
    await user.type(newInput, "Short1!");
    await user.tab();
    expect(
      await screen.findByText("Use 8 to 128 characters"),
    ).toBeInTheDocument();

    // Type valid new password and mismatched confirm
    await user.clear(newInput);
    await user.type(newInput, "ValidPass123!");
    await user.type(confirmInput, "DifferentPass456!");
    await user.tab();
    expect(
      await screen.findByText("Passwords don't match"),
    ).toBeInTheDocument();
  });

  it("AC-10: successful password reset replaces session and navigates to /", async () => {
    const resetSession = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });
    const freshSession = makeSession({
      requiresPasswordReset: false,
      user: resetSession.user,
    });

    let putBody: unknown = null;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, resetSession),
      "GET /api/workspaces": () =>
        jsonResponse(200, { workspaces: [], lastWorkspaceSlug: null }),
      "PUT /api/users/me/password": async (init) => {
        putBody = JSON.parse(init?.body as string);
        return jsonResponse(200, freshSession);
      },
    });

    const { user, router } = renderRoute();

    const currentInput = await screen.findByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Save new password" });

    await user.type(currentInput, "OldSecret123!");
    await user.type(newInput, "NewSecret456!");
    await user.type(confirmInput, "NewSecret456!");

    await user.click(submitBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });

    expect(putBody).toEqual({
      currentPassword: "OldSecret123!",
      newPassword: "NewSecret456!",
    });
    expect(
      await screen.findByText(
        "Password changed. You've been signed out on other devices.",
      ),
    ).toBeInTheDocument();
  });

  it("AC-31: 401 with expired session shows toast and redirects to /sign-in", async () => {
    const resetSession = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });

    let sessionCalls = 0;
    mockFetch({
      "GET /api/auth/session": () => {
        sessionCalls += 1;
        return sessionCalls === 1
          ? jsonResponse(200, resetSession)
          : apiError(401, "UNAUTHENTICATED", "Session expired");
      },
      "PUT /api/users/me/password": () =>
        apiError(401, "UNAUTHENTICATED", "Unauthenticated"),
    });

    const { user, router } = renderRoute();

    const currentInput = await screen.findByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Save new password" });

    await user.type(currentInput, "OldSecret123!");
    await user.type(newInput, "NewSecret456!");
    await user.type(confirmInput, "NewSecret456!");

    await user.click(submitBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });

    expect(
      await screen.findByText(
        "Your session expired. Sign in again to set a new password.",
      ),
    ).toBeInTheDocument();
  });

  it("401 with kept session displays submit error and stays on page", async () => {
    const resetSession = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });

    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, resetSession),
      "PUT /api/users/me/password": () =>
        apiError(401, "UNAUTHENTICATED", "Unauthenticated"),
    });

    const { user, router } = renderRoute();

    const currentInput = await screen.findByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Save new password" });

    await user.type(currentInput, "OldSecret123!");
    await user.type(newInput, "NewSecret456!");
    await user.type(confirmInput, "NewSecret456!");

    await user.click(submitBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Couldn't change your password. Please try again.",
    );
    expect(router.state.location.pathname).toBe(SET_PASSWORD_PATH);
  });

  it("Back to sign in button signs out and redirects to /sign-in", async () => {
    const session = makeSession({
      requiresPasswordReset: true,
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });
    let signOutCalled = false;
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
      "POST /api/auth/sign-out": () => {
        signOutCalled = true;
        return jsonResponse(204, null);
      },
    });

    const { user, router } = renderRoute();

    const backBtn = await screen.findByRole("button", {
      name: "Back to sign in",
    });
    await user.click(backBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/sign-in");
    });
    expect(signOutCalled).toBe(true);
  });
});
