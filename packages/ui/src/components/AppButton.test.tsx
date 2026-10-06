import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "../provider";
import { AppButton } from "./AppButton";

describe("AppButton", () => {
  it("renders its label and forwards clicks", () => {
    const onClick = vi.fn();
    render(
      <AppUiProvider>
        <AppButton onClick={onClick}>Save</AppButton>
      </AppUiProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
