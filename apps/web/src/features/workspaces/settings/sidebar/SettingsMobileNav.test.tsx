import { fireEvent, render, screen } from "@testing-library/react";
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
import { SettingsMobileNav } from "./SettingsMobileNav";

describe("SettingsMobileNav", () => {
  it("3f: renders Select with aria-label, grouped options, and navigates when changed", async () => {
    const ws = makeWorkspace({ slug: "openstudy" });
    const contextVal: CurrentWorkspaceValue = {
      workspace: ws,
      applyWorkspaceUpdate: vi.fn(),
      reload: vi.fn(),
    };

    const mockSections: WorkspaceSettingsSection[] = [
      {
        key: "general",
        group: "administration",
        label: "General",
        icon: BuildingIcon,
      },
      {
        key: "members",
        group: "administration",
        label: "Members",
        icon: BuildingIcon,
      },
    ];

    render(
      <AppUiProvider>
        <CurrentWorkspaceContext value={contextVal}>
          <MemoryRouter initialEntries={["/openstudy/settings/general"]}>
            <Routes>
              <Route
                path="/:workspaceSlug/settings/:section"
                element={<SettingsMobileNav sections={mockSections} />}
              />
              <Route
                path="/:workspaceSlug/settings/members"
                element={<div>Members Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </CurrentWorkspaceContext>
      </AppUiProvider>,
    );

    const select = screen.getByRole("combobox", {
      name: "Settings section",
    });
    expect(select).toHaveValue("General");

    fireEvent.click(select);
    const membersOption = screen.getByRole("option", {
      name: "Members",
      hidden: true,
    });
    fireEvent.click(membersOption);

    expect(await screen.findByText("Members Page")).toBeInTheDocument();
  });
});

