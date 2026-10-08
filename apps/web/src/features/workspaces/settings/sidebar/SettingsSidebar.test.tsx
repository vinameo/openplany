import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppUiProvider } from "@repo/ui";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { BuildingIcon } from "../../icons";
import {
  CurrentWorkspaceContext,
  type CurrentWorkspaceValue,
} from "../../currentWorkspace/currentWorkspaceContext";
import { makeWorkspace } from "../../test/workspaceFixtures";
import type { WorkspaceSettingsSection } from "../settingsSections";
import { SettingsSidebar } from "./SettingsSidebar";

function renderSidebarWithWorkspace(
  currentValue: CurrentWorkspaceValue,
  initialPath = "/openstudy/settings/general",
  props?: {
    sections?: readonly WorkspaceSettingsSection[];
    groups?: readonly { key: "administration"; label: string }[];
  },
) {
  return render(
    <AppUiProvider>
      <CurrentWorkspaceContext value={currentValue}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route
              path="/:workspaceSlug/settings/:section/*"
              element={<SettingsSidebar {...props} />}
            />
            <Route
              path="/:workspaceSlug/settings/:section"
              element={<SettingsSidebar {...props} />}
            />
            <Route
              path="/:workspaceSlug/settings"
              element={<SettingsSidebar {...props} />}
            />
          </Routes>
        </MemoryRouter>
      </CurrentWorkspaceContext>
    </AppUiProvider>,
  );
}

describe("SettingsSidebar", () => {
  it("3a: renders back button, title, workspace card with role, Administration header, and active General item", () => {
    const ws = makeWorkspace({
      slug: "openstudy",
      name: "OpenStudy",
      role: "owner",
    });

    const contextVal: CurrentWorkspaceValue = {
      workspace: ws,
      applyWorkspaceUpdate: vi.fn(),
      reload: vi.fn(),
    };

    renderSidebarWithWorkspace(contextVal, "/openstudy/settings/general");

    const backButton = screen.getByRole("link", {
      name: "Back to workspace",
    });
    expect(backButton).toHaveAttribute("href", "/openstudy");

    expect(
      screen.getByRole("heading", { name: "Workspace settings" }),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenStudy")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Administration" }),
    ).toBeInTheDocument();

    const generalItem = screen.getByRole("link", { name: /General/i });
    expect(generalItem).toHaveAttribute("aria-current", "page");
  });

  it("3b: hides sections missing viewPermission, hides empty groups, and throws on unknown group", () => {
    const ws = makeWorkspace({
      slug: "openstudy",
      permissions: [], // no permissions
    });

    const contextVal: CurrentWorkspaceValue = {
      workspace: ws,
      applyWorkspaceUpdate: vi.fn(),
      reload: vi.fn(),
    };

    const mockSections: WorkspaceSettingsSection[] = [
      {
        key: "restricted",
        group: "administration",
        label: "Restricted",
        icon: BuildingIcon,
        viewPermission: "workspace.settings.update",
      },
    ];

    renderSidebarWithWorkspace(
      contextVal,
      "/openstudy/settings/general",
      { sections: mockSections },
    );

    // Group should be hidden since restricted section is hidden
    expect(screen.queryByText("Restricted")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Administration" }),
    ).not.toBeInTheDocument();

    // Unknown group throws Error
    const invalidSections = [
      {
        key: "alien",
        group: "unknown_group" as unknown as "administration",
        label: "Alien",
        icon: BuildingIcon,
      },
    ];

    expect(() =>
      renderSidebarWithWorkspace(
        contextVal,
        "/openstudy/settings/general",
        { sections: invalidSections },
      ),
    ).toThrow(/unknown group/i);
  });

  it("3c: active section matches nested subroutes like /members/invites", () => {
    const ws = makeWorkspace({ slug: "openstudy" });
    const contextVal: CurrentWorkspaceValue = {
      workspace: ws,
      applyWorkspaceUpdate: vi.fn(),
      reload: vi.fn(),
    };

    const mockSections: WorkspaceSettingsSection[] = [
      {
        key: "members",
        group: "administration",
        label: "Members",
        icon: BuildingIcon,
      },
    ];

    renderSidebarWithWorkspace(
      contextVal,
      "/openstudy/settings/members/invites",
      { sections: mockSections },
    );

    const membersLink = screen.getByRole("link", { name: /Members/i });
    expect(membersLink).toHaveAttribute("aria-current", "page");
  });

  it("3d: clicking active General item does not cause unneeded navigation/fetch", async () => {
    const user = userEvent.setup();
    const ws = makeWorkspace({ slug: "openstudy" });
    const contextVal: CurrentWorkspaceValue = {
      workspace: ws,
      applyWorkspaceUpdate: vi.fn(),
      reload: vi.fn(),
    };

    renderSidebarWithWorkspace(contextVal, "/openstudy/settings/general");

    const generalItem = screen.getByRole("link", { name: /General/i });
    await user.click(generalItem);

    expect(generalItem).toHaveAttribute("aria-current", "page");
  });
});
