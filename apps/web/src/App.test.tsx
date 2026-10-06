import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the sign in screen", () => {
    render(
      <AppUiProvider>
        <App />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Sign in to OpenPlany" }),
    ).toBeInTheDocument();
  });
});
