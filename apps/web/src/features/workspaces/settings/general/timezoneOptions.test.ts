import { describe, expect, it, vi } from "vitest";
import {
  buildTimezoneOptions,
  formatUtcOffset,
  parseGmtOffset,
} from "./timezoneOptions";

describe("timezoneOptions", () => {
  describe("formatUtcOffset", () => {
    it("formats 0 as UTC+00:00", () => {
      expect(formatUtcOffset(0)).toBe("UTC+00:00");
    });

    it("formats positive offset 420 as UTC+07:00", () => {
      expect(formatUtcOffset(420)).toBe("UTC+07:00");
    });

    it("formats negative offset -210 as UTC-03:30", () => {
      expect(formatUtcOffset(-210)).toBe("UTC-03:30");
    });
  });

  describe("parseGmtOffset", () => {
    it("parses GMT and UTC to 0", () => {
      expect(parseGmtOffset("GMT")).toBe(0);
      expect(parseGmtOffset("UTC")).toBe(0);
    });

    it("parses GMT+07:00 to 420", () => {
      expect(parseGmtOffset("GMT+07:00")).toBe(420);
    });

    it("parses GMT-03:30 to -210", () => {
      expect(parseGmtOffset("GMT-03:30")).toBe(-210);
    });

    it("returns null for malformed string", () => {
      expect(parseGmtOffset("invalid")).toBeNull();
    });
  });

  describe("buildTimezoneOptions", () => {
    const fixedDate = new Date("2026-06-15T12:00:00Z");

    it("handles RangeError by setting offsetMinutes: null, placing at the end, and calling console.warn", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const options = buildTimezoneOptions(
        ["UTC", "Not/A_Real_Timezone", "Asia/Tokyo"],
        fixedDate,
      );

      expect(warnSpy).toHaveBeenCalledWith(
        "Unknown time zone",
        "Not/A_Real_Timezone",
      );

      const lastOpt = options[options.length - 1];
      expect(lastOpt?.value).toBe("Not/A_Real_Timezone");
      expect(lastOpt?.offsetMinutes).toBeNull();
      expect(lastOpt?.label).toBe("Not/A_Real_Timezone");

      warnSpy.mockRestore();
    });

    it("prepends currentZone if not in zones list with (current) in label", () => {
      const options = buildTimezoneOptions(
        ["UTC", "Asia/Tokyo"],
        fixedDate,
        "Asia/Saigon",
      );

      expect(options[0]?.value).toBe("Asia/Saigon");
      expect(options[0]?.label).toContain("Asia/Saigon (current)");
      expect(options[0]?.search).toContain("current");
    });

    it("sorts by offsetMinutes ascending, then alphabetically", () => {
      const options = buildTimezoneOptions(
        ["Asia/Tokyo", "America/New_York", "UTC"],
        fixedDate,
      );

      const values = options.map((o) => o.value);
      // America/New_York is UTC-4 in June, UTC is +0, Tokyo is +9
      expect(values).toEqual(["America/New_York", "UTC", "Asia/Tokyo"]);
    });
  });
});

