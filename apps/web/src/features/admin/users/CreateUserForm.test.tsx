import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { Notifications, notifications } from "@mantine/notifications";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../auth/AuthProvider";
import { makeSession } from "../../../test/authFixtures";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import { CreateUserForm } from "./CreateUserForm";

beforeEach(() => {
  mockFetch({
    "GET /api/auth/session": () =>
      jsonResponse(
        200,
        makeSession({
          user: { ...makeSession().user, isInstanceAdmin: true },
        }),
      ),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  notifications.clean();
});

function renderForm(props?: { onCancel?: () => void; onSuccess?: () => void }) {
  const onCancel = props?.onCancel ?? vi.fn();
  const onSuccess = props?.onSuccess ?? vi.fn();
  render(
    <AppUiProvider>
      <Notifications />
      <AuthProvider>
        <MemoryRouter>
          <CreateUserForm onCancel={onCancel} onSuccess={onSuccess} />
        </MemoryRouter>
      </AuthProvider>
    </AppUiProvider>,
  );
  return { onCancel, onSuccess, user: userEvent.setup() };
}

describe("CreateUserForm", () => {
  it("autofills display name, stops when edited, and resumes when cleared (AC-05)", async () => {
    const { user } = renderForm();

    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const displayNameInput = screen.getByLabelText(/display name/i);

    // Typing first and last name autofills display name
    await user.type(firstNameInput, "Kai");
    await user.type(lastNameInput, "Tran");
    expect(displayNameInput).toHaveValue("Kai Tran");

    // Manually editing display name disconnects autofill
    await user.clear(displayNameInput);
    await user.type(displayNameInput, "Kai");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Bao");
    expect(displayNameInput).toHaveValue("Kai");

    // Clearing display name reconnects autofill
    await user.clear(displayNameInput);
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "Nguyen");
    expect(displayNameInput).toHaveValue("Bao Nguyen");
  });

  it("disables Create user button when form is empty without showing errors (B4.4)", () => {
    renderForm();

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    expect(submitBtn).toBeDisabled();
    expect(screen.queryByText(/enter a first name/i)).not.toBeInTheDocument();
  });

  it("validates fields on blur (AC-11)", async () => {
    const { user } = renderForm();

    const firstNameInput = screen.getByLabelText(/first name/i);
    const emailInput = screen.getByLabelText(/email/i);

    await user.click(firstNameInput);
    await user.click(emailInput); // blur firstName
    expect(await screen.findByText("Enter a first name")).toBeInTheDocument();

    await user.type(emailInput, "not-an-email");
    await user.click(firstNameInput); // blur email
    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
  });

  it("validates password length and email collision (AC-13, AC-15)", async () => {
    const { user } = renderForm();

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);

    await user.type(passwordInput, "short");
    await user.click(confirmInput);
    expect(await screen.findByText("Use 8 to 128 characters")).toBeInTheDocument();

    await user.type(emailInput, "an@openplany.dev");
    await user.clear(passwordInput);
    await user.type(passwordInput, "AN@OPENPLANY.DEV");
    await user.click(confirmInput);
    expect(
      await screen.findByText("Password can't be the same as the email"),
    ).toBeInTheDocument();
  });

  it("clears password mismatch instantly when inputs match without blur (AC-14)", async () => {
    const { user } = renderForm();

    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);

    await user.type(passwordInput, "password123");
    await user.type(confirmInput, "password999");
    await user.click(passwordInput); // trigger blur on confirm
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();

    // Type in confirmInput until matching: error disappears immediately
    await user.clear(confirmInput);
    await user.type(confirmInput, "password123");
    expect(screen.queryByText("Passwords don't match")).not.toBeInTheDocument();
  });

  it("submits valid data, preserves password whitespace, shows toast and calls onSuccess (AC-06, AC-16, AC-17)", async () => {
    const fetchMock = mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "POST /api/admin/users": () =>
        jsonResponse(201, {
          id: "new-user-1",
          email: "an@openplany.dev",
          firstName: "An",
          lastName: "Nguyen",
          displayName: "An Nguyen",
          isInstanceAdmin: false,
          createdAt: "2026-10-09T10:00:00.000Z",
        }),
    });

    const { onSuccess, user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "  An  ");
    await user.type(screen.getByLabelText(/last name/i), "  Nguyen  ");
    // Display name autofills as "An Nguyen"
    await user.type(screen.getByLabelText(/email/i), "  An@OpenPlany.dev  ");
    await user.type(screen.getByLabelText(/^password/i), "  secret password 123  ");
    await user.type(screen.getByLabelText(/confirm password/i), "  secret password 123  ");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());

    await user.click(submitBtn);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const postCall = fetchMock.mock.calls.find((c) => c[0] === "/api/admin/users");
    expect(postCall).toBeDefined();
    const sentBody = JSON.parse(postCall![1]!.body as string);
    expect(sentBody).toEqual({
      firstName: "An",
      lastName: "Nguyen",
      displayName: "An Nguyen",
      email: "an@openplany.dev",
      password: "  secret password 123  ", // preserved whitespace
    });
    expect(sentBody.confirmPassword).toBeUndefined();

    expect(screen.getByText(/User created/i)).toBeInTheDocument();
    expect(
      screen.getByText(/An Nguyen can now sign in with an@openplany.dev/i),
    ).toBeInTheDocument();
  });

  it("handles 409 EMAIL_ALREADY_EXISTS by setting error on email and preserving form values (AC-09)", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "POST /api/admin/users": () =>
        apiError(409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.", {
          fields: { email: "A user with this email already exists." },
        }),
    });

    const { user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "An");
    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(
      await screen.findByText("A user with this email already exists."),
    ).toBeInTheDocument();
    // Inputs preserve values
    expect(screen.getByLabelText(/^password/i)).toHaveValue("secret123");
  });

  it("handles 400 with fields from server (AC-11)", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "POST /api/admin/users": () =>
        apiError(400, "VALIDATION_ERROR", "Check the highlighted fields", {
          fields: { displayName: "Server says invalid display name" },
        }),
    });

    const { user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "An");
    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(
      await screen.findByText("Server says invalid display name"),
    ).toBeInTheDocument();
  });

  it("handles 403 FORBIDDEN, displays alert and refreshes session (AC-04)", async () => {
    let sessionCalls = 0;
    mockFetch({
      "GET /api/auth/session": () => {
        sessionCalls++;
        return jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: false },
          }),
        );
      },
      "POST /api/admin/users": () =>
        apiError(403, "FORBIDDEN", "You don't have permission to create users"),
    });

    const { onSuccess, user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "An");
    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(
      await screen.findByText("You no longer have permission to create users."),
    ).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(sessionCalls).toBeGreaterThan(0));
  });

  it("handles 429 TOO_MANY_ATTEMPTS with rounded minutes (AC-12)", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        jsonResponse(
          200,
          makeSession({
            user: { ...makeSession().user, isInstanceAdmin: true },
          }),
        ),
      "POST /api/admin/users": () =>
        apiError(429, "TOO_MANY_ATTEMPTS", "Too many users created. Try again later.", {
          retryAfterSeconds: 120,
        }),
    });

    const { user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "An");
    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.type(screen.getByLabelText(/confirm password/i), "secret123");

    const submitBtn = screen.getByRole("button", { name: "Create user" });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await user.click(submitBtn);

    expect(
      await screen.findByText("Too many users created. Try again in 2 minutes."),
    ).toBeInTheDocument();
  });

  it("clicking Cancel button calls onCancel", async () => {
    const { onCancel, user } = renderForm();

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it("configures inputs with proper autoComplete, 1p/lp ignore, and no name attributes (AC-18, WEB-14)", () => {
    renderForm();

    const firstNameInput = screen.getByLabelText(/first name/i);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password/i);
    const confirmInput = screen.getByLabelText(/confirm password/i);

    expect(firstNameInput).toHaveAttribute("autocomplete", "off");
    expect(firstNameInput).toHaveAttribute("data-1p-ignore");
    expect(firstNameInput).toHaveAttribute("data-lpignore", "true");
    expect(firstNameInput).not.toHaveAttribute("name");

    expect(emailInput).toHaveAttribute("autocomplete", "off");
    expect(emailInput).not.toHaveAttribute("name");

    expect(passwordInput).toHaveAttribute("autocomplete", "new-password");
    expect(passwordInput).not.toHaveAttribute("name");

    expect(confirmInput).toHaveAttribute("autocomplete", "new-password");
    expect(confirmInput).not.toHaveAttribute("name");
  });
});

