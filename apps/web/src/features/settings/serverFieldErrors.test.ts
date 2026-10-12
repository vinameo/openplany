import { describe, expect, it } from "vitest";
import { splitServerFieldErrors } from "./serverFieldErrors";

describe("splitServerFieldErrors", () => {
  const fieldNames = ["name", "identifier", "description"] as const;

  it("handles null or non-object fields gracefully", () => {
    expect(splitServerFieldErrors(null, fieldNames)).toEqual({
      fieldErrors: {},
      hiddenMessages: [],
    });
    expect(splitServerFieldErrors("error", fieldNames)).toEqual({
      fieldErrors: {},
      hiddenMessages: [],
    });
  });

  it("splits known fields into fieldErrors and others into hiddenMessages", () => {
    const fields = {
      name: "Project name is already taken",
      coverKey: "Invalid project cover",
      "icon.color": "Invalid icon color",
      description: "Description is too long",
    };

    const res = splitServerFieldErrors(fields, fieldNames);
    expect(res.fieldErrors).toEqual({
      name: "Project name is already taken",
      description: "Description is too long",
    });
    expect(res.hiddenMessages).toEqual([
      "Invalid project cover",
      "Invalid icon color",
    ]);
  });

  it("extracts message from array if value is an array of strings", () => {
    const fields = {
      name: ["Name cannot be blank"],
      coverKey: ["Cover is required"],
    };

    const res = splitServerFieldErrors(fields, fieldNames);
    expect(res.fieldErrors).toEqual({
      name: "Name cannot be blank",
    });
    expect(res.hiddenMessages).toEqual(["Cover is required"]);
  });
});
