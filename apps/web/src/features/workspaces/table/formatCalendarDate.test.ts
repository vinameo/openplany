import { describe, expect, it } from "vitest";
import { setLanguage } from "../../../i18n";
import { formatCalendarDate } from "./formatCalendarDate";
import { getTimezoneOffsetMinutes } from "../../timezones/timezoneOptions";
import { applyProjectListQuery } from "../../projects/projectListView";
import type { ProjectListItem } from "@repo/contracts";

describe("formatCalendarDate and formatting invariants (INV-11, AC-11)", () => {
  it("formats calendar dates using en-US and vi-VN locales", () => {
    const iso = "2026-10-08T00:00:00.000Z";

    // Explicit language parameter
    const enDate = formatCalendarDate(iso, "UTC", "en");
    expect(enDate).toBe("Oct 08, 2026");

    const viDate = formatCalendarDate(iso, "UTC", "vi");
    expect(viDate).toBe("08 thg 10, 2026");

    // Inherits getLanguage()
    setLanguage("en");
    expect(formatCalendarDate(iso, "UTC")).toBe("Oct 08, 2026");

    setLanguage("vi");
    expect(formatCalendarDate(iso, "UTC")).toBe("08 thg 10, 2026");
    setLanguage("en");
  });

  it("formats numbers per locale in sentence context (1,005 vs 1.005)", () => {
    const enNum = new Intl.NumberFormat("en-US").format(1005);
    const viNum = new Intl.NumberFormat("vi-VN").format(1005);

    expect(enNum).toBe("1,005");
    expect(viNum).toBe("1.005");
  });

  it("ensures getTimezoneOffsetMinutes produces identical results across languages", () => {
    setLanguage("en");
    const enUtcOffset = getTimezoneOffsetMinutes("UTC");
    const enHcmOffset = getTimezoneOffsetMinutes("Asia/Ho_Chi_Minh");
    const enNyOffset = getTimezoneOffsetMinutes("America/New_York");

    setLanguage("vi");
    const viUtcOffset = getTimezoneOffsetMinutes("UTC");
    const viHcmOffset = getTimezoneOffsetMinutes("Asia/Ho_Chi_Minh");
    const viNyOffset = getTimezoneOffsetMinutes("America/New_York");

    expect(viUtcOffset).toBe(enUtcOffset);
    expect(viHcmOffset).toBe(enHcmOffset);
    expect(viNyOffset).toBe(enNyOffset);
    setLanguage("en");
  });

  function makeProject(
    id: string,
    identifier: string,
    name: string,
    createdAt: string,
  ): ProjectListItem {
    return {
      id,
      name,
      identifier,
      description: "",
      icon: { name: "folder", color: "#1D4ED8" },
      coverKey: "cover_1",
      role: "admin",
      permissions: ["project.members.view"],
      members: null,
      memberCount: 1,
      createdAt,
      updatedAt: createdAt,
      timezone: null,
      effectiveTimezone: "UTC",
    };
  }

  it("ensures project list name collation produces identical sort order across languages", () => {
    const mockProjects: ProjectListItem[] = [
      makeProject("p-3", "PRJ-3", "Đà Nẵng Office", "2026-01-01T00:00:00Z"),
      makeProject("p-1", "PRJ-1", "Alpha Project", "2026-01-02T00:00:00Z"),
      makeProject("p-2", "PRJ-2", "Cần Thơ Branch", "2026-01-03T00:00:00Z"),
    ];

    setLanguage("en");
    const sortedEn = applyProjectListQuery(mockProjects, {
      search: "",
      sort: { key: "name", direction: "asc" },
    }).map((p) => p.name);

    setLanguage("vi");
    const sortedVi = applyProjectListQuery(mockProjects, {
      search: "",
      sort: { key: "name", direction: "asc" },
    }).map((p) => p.name);

    expect(sortedVi).toEqual(sortedEn);
    setLanguage("en");
  });
});
