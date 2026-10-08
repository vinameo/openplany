import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Notifications, notifications } from "@mantine/notifications";
import { AppUiProvider } from "@repo/ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceUrlField } from "./WorkspaceUrlField";

afterEach(() => {
  notifications.clean();
});

describe("WorkspaceUrlField", () => {
  it("renders read-only URL input and copies full URL to clipboard with toast notification", async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    render(
      <AppUiProvider>
        <Notifications />
        <WorkspaceUrlField slug="openstudy" />
      </AppUiProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Workspace URL" });
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue(`${window.location.host}/openstudy`);

    const copyBtn = screen.getByRole("button", {
      name: "Copy workspace URL",
    });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      `${window.location.origin}/openstudy`,
    );
    expect(await screen.findByText("URL copied")).toBeInTheDocument();
  });
});

