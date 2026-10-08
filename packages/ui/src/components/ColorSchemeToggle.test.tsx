import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppUiProvider } from "../provider";
import { ColorSchemeToggle } from "./ColorSchemeToggle";

describe("ColorSchemeToggle", () => {
  beforeEach(() => {
    // Mantine persists the scheme; start every test from the default.
    window.localStorage.clear();
  });

  it("switches to dark and back, updating the html attribute and its label", () => {
    render(
      <AppUiProvider defaultColorScheme="light">
        <ColorSchemeToggle />
      </AppUiProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(document.documentElement).toHaveAttribute(
      "data-mantine-color-scheme",
      "light",
    );
  });

  it("starts from the saved choice", () => {
    window.localStorage.setItem("mantine-color-scheme-value", "dark");

    render(
      <AppUiProvider defaultColorScheme="light">
        <ColorSchemeToggle />
      </AppUiProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });
});
