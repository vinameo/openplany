import { describe, expect, it } from "vitest";
import { BuildingIcon } from "../icons";
import {
  type WorkspaceSettingsSection,
  visibleSettingsSections,
} from "./settingsSections";

describe("settingsSections", () => {
  it("visibleSettingsSections includes sections without viewPermission", () => {
    const visible = visibleSettingsSections([]);
    expect(visible.map((s) => s.key)).toContain("general");
  });

  it("filters sections based on EnforcedWorkspacePermission", () => {
    const customSection: WorkspaceSettingsSection = {
      key: "custom",
      group: "administration",
      label: "Custom",
      icon: BuildingIcon,
      viewPermission: "workspace.settings.update",
    };

    expect(visibleSettingsSections([], [customSection])).toHaveLength(0);
    expect(
      visibleSettingsSections(["workspace.settings.update"], [customSection]),
    ).toEqual([customSection]);
  });

  it("AC-17: members section is visible with workspace.members.view and hidden without", () => {
    expect(visibleSettingsSections([]).map((s) => s.key)).not.toContain("members");
    expect(
      visibleSettingsSections(["workspace.members.view"]).map((s) => s.key),
    ).toContain("members");
  });

  it("WEB-13: viewPermission rejects non-enforced permissions at compile-time", () => {
    const _invalidSection: WorkspaceSettingsSection = {
      key: "dangerous",
      group: "administration",
      label: "Dangerous",
      icon: BuildingIcon,
      // @ts-expect-error viewPermission must be EnforcedWorkspacePermission (AC-13 / WEB-13)
      viewPermission: "workspace.delete",
    };
    expect(_invalidSection).toBeDefined();
  });
});
