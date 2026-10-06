import { render, screen } from "@testing-library/react";
import { AppUiProvider } from "@repo/ui";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the platform heading and API check button", () => {
    render(
      <AppUiProvider>
        <App />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "OpenPlany Platform" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check NestJS API" }),
    ).toBeInTheDocument();
  });
});
