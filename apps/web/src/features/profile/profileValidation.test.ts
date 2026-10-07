import { describe, expect, it } from "vitest";
import {
  diffProfile,
  fullName,
  normalizeName,
  validateName,
} from "./profileValidation";

describe("validateName", () => {
  it("requires a first name and a display name", () => {
    expect(validateName("firstName", "   ")).toBe("Enter your first name");
    expect(validateName("displayName", "")).toBe("Enter a display name");
  });

  it("allows an empty last name", () => {
    expect(validateName("lastName", "")).toBeNull();
  });

  it("accepts exactly 50 characters and rejects 51", () => {
    expect(validateName("displayName", "a".repeat(50))).toBeNull();
    expect(validateName("displayName", "a".repeat(51))).toBe(
      "Display name must be 50 characters or fewer",
    );
  });

  it("measures the trimmed value", () => {
    expect(validateName("firstName", ` ${"a".repeat(50)} `)).toBeNull();
  });

  it.each(["Ka​i", "Kai‮", "Ka\u0007i", "Kai\nTran"])(
    "rejects hidden or control characters in %j",
    (value) => {
      expect(validateName("lastName", value)).toBe(
        "Contains characters that aren't allowed",
      );
    },
  );
});

describe("normalizeName", () => {
  it("trims and composes decomposed Vietnamese text", () => {
    expect(normalizeName("  Nguyễn ")).toBe("Nguyễn");
  });
});

describe("diffProfile", () => {
  const initial = { firstName: "An", lastName: "Nguyen", displayName: "An" };

  it("is empty when nothing changed, ignoring surrounding spaces", () => {
    expect(diffProfile(initial, { ...initial, firstName: " An " })).toEqual({});
  });

  it("returns only changed fields, normalized", () => {
    expect(
      diffProfile(initial, { ...initial, displayName: "  Kai ", lastName: "" }),
    ).toEqual({ displayName: "Kai", lastName: "" });
  });

  it("is empty again after typing the original value back", () => {
    expect(diffProfile(initial, { ...initial, firstName: "Kai" })).not.toEqual(
      {},
    );
    expect(diffProfile(initial, { ...initial, firstName: "An" })).toEqual({});
  });
});

describe("fullName", () => {
  it("joins the parts that are present", () => {
    expect(fullName({ firstName: "Kai", lastName: " Tran " })).toBe("Kai Tran");
    expect(fullName({ firstName: "Kai", lastName: "" })).toBe("Kai");
  });

  it("is null when both are empty", () => {
    expect(fullName({ firstName: " ", lastName: "" })).toBeNull();
  });
});
