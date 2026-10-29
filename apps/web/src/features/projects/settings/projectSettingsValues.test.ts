import { describe, expect, it } from "vitest";
import type { ProjectListItem } from "@repo/contracts";
import {
  FOLLOW_WORKSPACE_TIMEZONE,
  toProjectSettingsValues,
  toUpdateProjectRequest,
} from "./projectSettingsValues";

const sampleProject: ProjectListItem = {
  id: "p-1",
  name: "My Project",
  identifier: "MYP",
  description: "Some description",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  timezone: null,
  effectiveTimezone: "UTC",
  members: [],
  memberCount: 0,
  role: "admin",
  permissions: ["project.settings.update"],
};

describe("projectSettingsValues", () => {
  describe("toProjectSettingsValues", () => {
    it("maps project with null timezone to FOLLOW_WORKSPACE_TIMEZONE", () => {
      const values = toProjectSettingsValues(sampleProject);
      expect(values).toEqual({
        name: "My Project",
        description: "Some description",
        iconName: "rocket",
        iconColor: "#15AABF",
        coverKey: "cover-01",
        timezone: FOLLOW_WORKSPACE_TIMEZONE,
      });
    });

    it("maps project with explicit timezone", () => {
      const values = toProjectSettingsValues({
        ...sampleProject,
        timezone: "Asia/Tokyo",
      });
      expect(values.timezone).toBe("Asia/Tokyo");
    });
  });

  describe("toUpdateProjectRequest", () => {
    it("only includes fields present in changes", () => {
      const current = toProjectSettingsValues(sampleProject);
      const req = toUpdateProjectRequest({ name: "New Name" }, current);
      expect(req).toEqual({ name: "New Name" });
    });

    it("includes both iconName and iconColor when either changes", () => {
      const current = toProjectSettingsValues(sampleProject);
      const reqIconColor = toUpdateProjectRequest(
        { iconColor: "#FAB005" },
        current,
      );
      expect(reqIconColor).toEqual({
        icon: { name: "rocket", color: "#FAB005" },
      });

      const reqIconName = toUpdateProjectRequest({ iconName: "star" }, current);
      expect(reqIconName).toEqual({
        icon: { name: "star", color: "#15AABF" },
      });
    });

    it("maps FOLLOW_WORKSPACE_TIMEZONE back to null", () => {
      const current = toProjectSettingsValues({
        ...sampleProject,
        timezone: "Asia/Tokyo",
      });
      const req = toUpdateProjectRequest(
        { timezone: FOLLOW_WORKSPACE_TIMEZONE },
        current,
      );
      expect(req).toEqual({ timezone: null });
    });

    it("preserves explicit timezone string", () => {
      const current = toProjectSettingsValues(sampleProject);
      const req = toUpdateProjectRequest(
        { timezone: "Europe/London" },
        current,
      );
      expect(req).toEqual({ timezone: "Europe/London" });
    });
  });
});
