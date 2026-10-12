import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "../../../test/mediaQuery";
import { SidebarCollapseButton } from "./SidebarCollapseButton";
import { SidebarExpandButton } from "./SidebarExpandButton";
import { SidebarShell } from "./SidebarShell";

function renderShell(navLabel: string, isDesktop: boolean) {
  stubMatchMedia(isDesktop);
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <SidebarShell
          navLabel={navLabel}
          sidebar={
            <div>
              <span>Sidebar Content</span>
              <SidebarCollapseButton />
            </div>
          }
          header={
            <div>
              <SidebarExpandButton />
              <span>Header Content</span>
            </div>
          }
        >
          <div>Main Content</div>
        </SidebarShell>
      ),
    },
  ]);

  render(
    <AppUiProvider>
      <RouterProvider router={router} />
    </AppUiProvider>,
  );
}

describe("SidebarShell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("desktop: renders nav with custom navLabel", () => {
    renderShell("Project", true);

    const nav = screen.getByRole("navigation", { name: "Project" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByText("Sidebar Content")).toBeInTheDocument();
    expect(screen.getByText("Header Content")).toBeInTheDocument();
    expect(screen.getByText("Main Content")).toBeInTheDocument();
  });

  it("mobile: renders Drawer dialog with custom navLabel when opened", async () => {
    const user = userEvent.setup();
    renderShell("Project", false);

    expect(
      screen.queryByRole("navigation", { name: "Project" }),
    ).not.toBeInTheDocument();

    const openBtn = screen.getByRole("button", { name: "Open sidebar" });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog", { name: "Project" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Sidebar Content")).toBeInTheDocument();
  });
});
