import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

function renderLoginPage(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AppUiProvider>
      <LoginPage onSubmit={onSubmit} />
    </AppUiProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

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

  it("submits the trimmed email and password", async () => {
    const { user, onSubmit } = renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "  an@openplany.dev ");
    await user.type(screen.getByLabelText(/^password/i), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "an@openplany.dev",
      password: "secret123",
    });
  });

  it("shows the error message when sign in fails", async () => {
    const { user } = renderLoginPage(
      vi.fn().mockRejectedValue(new Error("Incorrect email or password")),
    );

    await user.type(screen.getByLabelText(/email/i), "an@openplany.dev");
    await user.type(screen.getByLabelText(/^password/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password",
    );
  });

  it("links to the forgot password page", () => {
    renderLoginPage();

    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });
});
