import { describe, expect, it } from "vitest";
import {
  buildSettingsNavigation,
  firstOpenableSection,
  type SettingsGroup,
  type SettingsSection,
} from "./settingsNavigation";

const DummyIcon = () => null;

const groups: readonly SettingsGroup[] = [
  { key: "general", label: "General" },
  { key: "access", label: "Access" },
];

const sections: readonly SettingsSection<"read" | "write">[] = [
  {
    key: "gen",
    group: "general",
    label: "General",
    icon: DummyIcon,
  },
  {
    key: "team",
    group: "access",
    label: "Team",
    icon: DummyIcon,
    viewPermission: "read",
  },
  {
    key: "billing",
    group: "access",
    label: "Billing",
    icon: DummyIcon,
    viewPermission: "write",
    comingSoon: true,
  },
];

describe("settingsNavigation", () => {
  describe("buildSettingsNavigation", () => {
    it("filters sections by permission and omits empty groups", () => {
      const nav = buildSettingsNavigation({
        sections,
        groups,
        permissions: [],
        activeKey: "gen",
      });

      expect(nav.groups).toHaveLength(1);
      expect(nav.groups[0]?.key).toBe("general");
      expect(nav.groups[0]?.sections.map((s) => s.key)).toEqual(["gen"]);
      expect(nav.activeKey).toBe("gen");
    });

    it("includes all sections when permissions is null (loading state)", () => {
      const nav = buildSettingsNavigation({
        sections,
        groups,
        permissions: null,
        activeKey: "gen",
      });

      expect(nav.groups).toHaveLength(2);
      expect(nav.groups[0]?.sections.map((s) => s.key)).toEqual(["gen"]);
      expect(nav.groups[1]?.sections.map((s) => s.key)).toEqual([
        "team",
        "billing",
      ]);
    });

    it("throws an error when a section belongs to an unknown group", () => {
      const invalidSections: readonly SettingsSection<string>[] = [
        {
          key: "orphan",
          group: "unknown",
          label: "Orphan",
          icon: DummyIcon,
        },
      ];

      expect(() =>
        buildSettingsNavigation({
          sections: invalidSections,
          groups,
          permissions: [],
          activeKey: null,
        }),
      ).toThrow('Section "orphan" belongs to unknown group "unknown"');
    });

    it("does not set activeKey if matched section is comingSoon", () => {
      const nav = buildSettingsNavigation({
        sections,
        groups,
        permissions: ["write"],
        activeKey: "billing",
      });

      expect(nav.activeKey).toBeNull();
    });

    it("returns null for activeKey if activeKey does not match any visible section", () => {
      const nav = buildSettingsNavigation({
        sections,
        groups,
        permissions: [],
        activeKey: "nonexistent",
      });

      expect(nav.activeKey).toBeNull();
    });
  });

  describe("firstOpenableSection", () => {
    it("returns the first section with an active page that viewer has permission to open", () => {
      expect(firstOpenableSection(sections, [])?.key).toBe("gen");
      expect(firstOpenableSection(sections, ["read"])?.key).toBe("gen");

      const accessOnlySections: readonly SettingsSection<"read">[] = [
        {
          key: "members",
          group: "access",
          label: "Members",
          icon: DummyIcon,
          viewPermission: "read",
        },
      ];

      expect(firstOpenableSection(accessOnlySections, [])).toBeNull();
      expect(firstOpenableSection(accessOnlySections, ["read"])?.key).toBe(
        "members",
      );
    });

    it("skips comingSoon sections even if viewer has permission", () => {
      const onlyComingSoon: readonly SettingsSection<"write">[] = [
        {
          key: "billing",
          group: "access",
          label: "Billing",
          icon: DummyIcon,
          viewPermission: "write",
          comingSoon: true,
        },
      ];

      expect(firstOpenableSection(onlyComingSoon, ["write"])).toBeNull();
    });
  });
});
