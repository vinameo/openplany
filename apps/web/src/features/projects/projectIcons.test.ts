import { DEFAULT_PROJECT_ICON, PROJECT_ICON_NAMES } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { PROJECT_ICON_COMPONENTS, projectIconComponent } from "./projectIcons";

describe("projectIcons", () => {
  it("INV-10: maps all 65 icon names in contracts to valid components", () => {
    expect(PROJECT_ICON_NAMES).toHaveLength(65);
    for (const name of PROJECT_ICON_NAMES) {
      const comp = PROJECT_ICON_COMPONENTS[name];
      expect(comp).toBeDefined();
      expect(projectIconComponent(name)).toBe(comp);
    }
  });

  it("returns default icon component for unknown or empty names", () => {
    const defaultComp = PROJECT_ICON_COMPONENTS[DEFAULT_PROJECT_ICON];
    expect(projectIconComponent("unknown-icon-name")).toBe(defaultComp);
    expect(projectIconComponent("")).toBe(defaultComp);
  });
});
