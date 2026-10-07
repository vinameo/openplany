import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api/authApi";
import { LoginPage } from "./LoginPage";

type Submit = (values: { email: string; password: string }) => Promise<void>;

function renderLoginPage(
  onSubmit: Submit = vi.fn<Submit>().mockResolvedValue(undefined),
  userOptions: Parameters<typeof userEvent.setup>[0] = {},
) {
  render(
    <AppUiProvider>
      <LoginPage onSubmit={onSubmit} />
    </AppUiProvider>,
  );
  return { onSubmit, user: userEvent.setup(userOptions) };
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  email = "an@openplany.dev",
  password = "secret123",
) {
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/^password/i), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LoginPage", () => {
  it("disables sign in until email and password are filled", async () => {
    const { user } = renderLoginPage();
    const signIn = screen.getByRole("button", { name: "Sign in" });

    expect(signIn).toBeDisabled();

    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    expect(signIn).toBeDisabled();

    await user.type(screen.getByLabelText(/^password/i), "secret123");
    expect(signIn).toBeEnabled();
  });

  it("treats a whitespace-only email as empty", async () => {
    const { user } = renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "   ");
    await user.type(screen.getByLabelText(/^password/i), "secret123");

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("submits the trimmed email and password", async () => {
    const { user, onSubmit } = renderLoginPage();

    await fillAndSubmit(user, "  an@openplany.dev ");

    expect(onSubmit).toHaveBeenCalledWith({
      email: "an@openplany.dev",
      password: "secret123",
    });
  });

  it("shows the error message when sign in fails", async () => {
    const { user } = renderLoginPage(
      vi.fn<Submit>().mockRejectedValue(new Error("Something broke")),
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something broke",
    );
  });

  it("keeps the email, clears the password and focuses it after a 401", async () => {
    const { user } = renderLoginPage(
      vi.fn<Submit>().mockRejectedValue(
        new ApiRequestError(401, {
          code: "INVALID_CREDENTIALS",
          message: "Incorrect email or password",
        }),
      ),
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password",
    );
    expect(screen.getByLabelText(/email/i)).toHaveValue("an@openplany.dev");
    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveValue("");
    expect(password).toHaveFocus();
  });

  it("shows validation errors under the matching fields", async () => {
    const { user } = renderLoginPage(
      vi.fn<Submit>().mockRejectedValue(
        new ApiRequestError(400, {
          code: "VALIDATION_ERROR",
          message: "Check the highlighted fields",
          fields: { email: "Enter a valid email" },
        }),
      ),
    );

    await fillAndSubmit(user, "an@");

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("locks the button with a countdown after a 429, then unlocks", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user } = renderLoginPage(
      vi.fn<Submit>().mockRejectedValue(
        new ApiRequestError(429, {
          code: "TOO_MANY_ATTEMPTS",
          message: "Too many attempts. Try again in 2 minutes.",
          retryAfterSeconds: 90,
        }),
      ),
      { advanceTimers: vi.advanceTimersByTime },
    );

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in 2 minutes.",
    );
    expect(
      screen.getByRole("button", { name: "Try again in 1:30" }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      screen.getByRole("button", { name: "Try again in 1:00" }),
    ).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tabs from email to password, the eye toggle, then the forgot link", async () => {
    const { user } = renderLoginPage();

    expect(screen.getByLabelText(/email/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/^password/i)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveFocus();
  });

  it("toggles password visibility with a labelled button", async () => {
    const { user } = renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();
  });

  it("links to the forgot password page", () => {
    renderLoginPage();

    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});
