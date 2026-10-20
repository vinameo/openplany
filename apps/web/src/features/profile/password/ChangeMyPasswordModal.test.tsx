import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { ChangeMyPasswordModal } from "./ChangeMyPasswordModal";

function renderModal({
  opened = true,
  onClose = vi.fn(),
  user = makeSession().user,
  extraHandlers = {},
} = {}) {
  const fetchMock = mockFetch({
    "GET /api/auth/session": () => jsonResponse(200, makeSession({ user })),
    ...extraHandlers,
  });

  render(
    <AppUiProvider>
      <AuthProvider>
        <ChangeMyPasswordModal
          opened={opened}
          onClose={onClose}
          user={user}
        />
      </AuthProvider>
    </AppUiProvider>,
  );

  return { user: userEvent.setup(), onClose, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChangeMyPasswordModal", () => {
  it("validates fields on blur and submit (AC-06..AC-08)", async () => {
    const session = makeSession({
      user: { ...makeSession().user, email: "an@openplany.dev" },
    });
    const { user } = renderModal({ user: session.user });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");

    // Blur empty current password
    await user.click(currentInput);
    await user.tab();
    expect(
      await screen.findByText("Enter your current password"),
    ).toBeInTheDocument();

    // Type valid current password
    await user.type(currentInput, "OldPassword123!");

    // Type new password equal to email
    await user.type(newInput, "an@openplany.dev");
    await user.tab();
    expect(
      await screen.findByText("Password can't be the same as the email"),
    ).toBeInTheDocument();

    // Type new password too short
    await user.clear(newInput);
    await user.type(newInput, "Short1!");
    await user.tab();
    expect(
      await screen.findByText("Use 8 to 128 characters"),
    ).toBeInTheDocument();

    // Type new password equal to current password
    await user.clear(newInput);
    await user.type(newInput, "OldPassword123!");
    await user.tab();
    expect(
      await screen.findByText("Choose a password different from your current one"),
    ).toBeInTheDocument();

    // Type mismatched confirm password
    await user.clear(newInput);
    await user.type(newInput, "ValidNewPassword456!");
    await user.type(confirmInput, "DifferentPassword789!");
    await user.tab();
    expect(
      await screen.findByText("Passwords don't match"),
    ).toBeInTheDocument();
  });

  it("AC-05, INV-15, INV-W3: sends only { currentPassword, newPassword } without confirmPassword, calls replaceSession, shows toast, and closes modal", async () => {
    const session = makeSession();
    const renewedSession = makeSession({
      user: { ...session.user },
    });

    const notifySpy = vi.spyOn(notifications, "show");
    const { user, onClose, fetchMock } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () => jsonResponse(200, renewedSession),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "OldPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Check payload has NO confirmPassword
    const putCall = fetchMock.mock.calls.find(([input]) =>
      String(input) === "/api/users/me/password",
    );
    expect(putCall).toBeDefined();
    expect(JSON.parse((putCall![1] as RequestInit).body as string)).toEqual({
      currentPassword: "OldPassword123!",
      newPassword: "NewPassword456!",
    });

    // Toast shown
    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Password changed. You've been signed out on other devices.",
      }),
    );

    // Verify GET /api/auth/session was NOT called to renew
    const getSessionCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input) === "/api/auth/session",
    );
    // Only the initial session check on mount
    expect(getSessionCalls.length).toBeLessThanOrEqual(1);

    notifySpy.mockRestore();
  });

  it("AC-07: handles 400 CURRENT_PASSWORD_INCORRECT under currentPassword and focuses field", async () => {
    const session = makeSession();
    const { user } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () =>
          apiError(400, "CURRENT_PASSWORD_INCORRECT", "Incorrect password"),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "WrongPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    expect(
      await screen.findByText("Your current password is incorrect."),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(currentInput);
  });

  it("AC-06: handles 400 VALIDATION_ERROR with field errors from server", async () => {
    const session = makeSession();
    const { user } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () =>
          apiError(400, "VALIDATION_ERROR", "Validation failed", {
            fields: {
              newPassword: "Server rejected new password",
            },
          }),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "OldPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    expect(
      await screen.findByText("Server rejected new password"),
    ).toBeInTheDocument();
  });

  it("AC-26: handles 429 TOO_MANY_PASSWORD_ATTEMPTS with alert box and retry minutes", async () => {
    const session = makeSession();
    const { user } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () =>
          apiError(429, "TOO_MANY_PASSWORD_ATTEMPTS", "Rate limited", {
            retryAfterSeconds: 900,
          }),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "OldPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Too many incorrect passwords. Try again in 15 minutes.",
    );
  });

  it("AC-26: handles 429 TOO_MANY_PASSWORD_CHANGES with alert box and retry minutes", async () => {
    const session = makeSession();
    const { user } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () =>
          apiError(429, "TOO_MANY_PASSWORD_CHANGES", "Rate limited", {
            retryAfterSeconds: 600,
          }),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "OldPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Too many password changes. Try again in 10 minutes.",
    );
  });

  it("handles 409 PASSWORD_CHANGED_ELSEWHERE with alert box", async () => {
    const session = makeSession();
    const { user } = renderModal({
      user: session.user,
      extraHandlers: {
        "PUT /api/users/me/password": () =>
          apiError(409, "PASSWORD_CHANGED_ELSEWHERE", "Conflict"),
      },
    });

    const currentInput = screen.getByLabelText("Current password *");
    const newInput = screen.getByLabelText("New password *");
    const confirmInput = screen.getByLabelText("Confirm new password *");
    const submitBtn = screen.getByRole("button", { name: "Change password" });

    await user.type(currentInput, "OldPassword123!");
    await user.type(newInput, "NewPassword456!");
    await user.type(confirmInput, "NewPassword456!");

    await user.click(submitBtn);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Your password was just changed somewhere else. Please try again.",
    );
  });

  it("AC-18: prompts to discard unsaved changes when user typed and attempts close", async () => {
    const session = makeSession();
    const { user, onClose } = renderModal({ user: session.user });

    const currentInput = screen.getByLabelText("Current password *");
    await user.type(currentInput, "TypingSomething");

    // Click Cancel button
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    // Prompt shown
    expect(
      screen.getByText("Discard unsaved changes?"),
    ).toBeInTheDocument();
    const keepEditingBtn = screen.getByRole("button", { name: "Keep editing" });
    const discardBtn = screen.getByRole("button", { name: "Discard" });
    expect(discardBtn).toBeInTheDocument();

    // Clicking Keep editing stays in modal
    await user.click(keepEditingBtn);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("TypingSomething")).toBeInTheDocument();

    // Clicking Cancel again then Discard closes
    const remountedCancelBtn = await screen.findByRole("button", {
      name: "Cancel",
    });
    await user.click(remountedCancelBtn);

    const remountedDiscardBtn = await screen.findByRole("button", {
      name: "Discard",
    });
    await user.click(remountedDiscardBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
