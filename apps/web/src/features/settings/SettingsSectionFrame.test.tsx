import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppUiProvider } from "@repo/ui";
import { SettingsSectionFrame } from "./SettingsSectionFrame";

function MockIcon() {
  return <svg data-testid="mock-icon" />;
}

describe("SettingsSectionFrame", () => {
  it("renders children when allowed and ready", () => {
    render(
      <AppUiProvider>
        <SettingsSectionFrame icon={MockIcon} label="General" allowed={true}>
          <div data-testid="content">Content</div>
        </SettingsSectionFrame>
      </AppUiProvider>,
    );

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("renders access denied alert when not allowed", () => {
    render(
      <AppUiProvider>
        <SettingsSectionFrame icon={MockIcon} label="General" allowed={false}>
          <div data-testid="content">Content</div>
        </SettingsSectionFrame>
      </AppUiProvider>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders loader when status is loading", () => {
    render(
      <AppUiProvider>
        <SettingsSectionFrame
          icon={MockIcon}
          label="States"
          allowed={true}
          status="loading"
        >
          <div data-testid="content">Content</div>
        </SettingsSectionFrame>
      </AppUiProvider>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders error alert with retry button when status is error", async () => {
    const onRetry = vi.fn();
    render(
      <AppUiProvider>
        <SettingsSectionFrame
          icon={MockIcon}
          label="States"
          allowed={true}
          status="error"
          errorMessage="Failed to load"
          retryLabel="Retry"
          onRetry={onRetry}
        >
          <div data-testid="content">Content</div>
        </SettingsSectionFrame>
      </AppUiProvider>,
    );

    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

