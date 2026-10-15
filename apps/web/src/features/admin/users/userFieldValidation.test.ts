import { describe, expect, it } from "vitest";
import type { AdminUserResponse } from "@repo/contracts";
import {
  adminUserLabel,
  buildUpdateAdminUserPayload,
  hasEditUserChanges,
  type CreateUserValues,
  type EditUserValues,
  validateConfirmPassword,
  validateCreateUserField,
  validateDisplayName,
  validateEditUserField,
  validateEmail,
  validateFirstName,
  validateLastName,
  validatePassword,
} from "./userFieldValidation";

describe("userFieldValidation", () => {
  const baseValues: CreateUserValues = {
    firstName: "An",
    lastName: "Nguyen",
    displayName: "An Nguyen",
    email: "an@openplany.dev",
    password: "password123",
    confirmPassword: "password123",
  };

  describe("firstName", () => {
    it("accepts valid names and decomposed Unicode normalized to NFC", () => {
      expect(validateCreateUserField("firstName", baseValues)).toBeNull();
      expect(validateFirstName("An")).toBeNull();
      // Khái vs Khái
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "Kha\u0301i",
        }),
      ).toBeNull();
      expect(validateFirstName("Kha\u0301i")).toBeNull();
    });

    it("requires non-empty name after normalization", () => {
      expect(
        validateCreateUserField("firstName", { ...baseValues, firstName: "" }),
      ).toBe("Enter a first name");
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "   ",
        }),
      ).toBe("Enter a first name");
      expect(validateFirstName("")).toBe("Enter a first name");
      expect(validateFirstName("   ")).toBe("Enter a first name");
    });

    it("rejects names longer than 50 characters", () => {
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "a".repeat(51),
        }),
      ).toBe("First name must be 50 characters or fewer");
      expect(validateFirstName("a".repeat(51))).toBe(
        "First name must be 50 characters or fewer",
      );
    });

    it("rejects control and zero-width characters", () => {
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "An\u200B",
        }),
      ).toBe("Contains characters that aren't allowed");
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "An\u0000",
        }),
      ).toBe("Contains characters that aren't allowed");
      expect(validateFirstName("An\u200B")).toBe(
        "Contains characters that aren't allowed",
      );
    });
  });

  describe("lastName", () => {
    it("accepts empty last name", () => {
      expect(
        validateCreateUserField("lastName", { ...baseValues, lastName: "" }),
      ).toBeNull();
      expect(
        validateCreateUserField("lastName", { ...baseValues, lastName: "   " }),
      ).toBeNull();
      expect(validateLastName("")).toBeNull();
      expect(validateLastName("   ")).toBeNull();
    });

    it("rejects last name longer than 50 characters", () => {
      expect(
        validateCreateUserField("lastName", {
          ...baseValues,
          lastName: "a".repeat(51),
        }),
      ).toBe("Last name must be 50 characters or fewer");
      expect(validateLastName("a".repeat(51))).toBe(
        "Last name must be 50 characters or fewer",
      );
    });

    it("rejects invalid characters in last name", () => {
      expect(
        validateCreateUserField("lastName", {
          ...baseValues,
          lastName: "Nguyen\u200E",
        }),
      ).toBe("Contains characters that aren't allowed");
      expect(validateLastName("Nguyen\u200E")).toBe(
        "Contains characters that aren't allowed",
      );
    });
  });

  describe("displayName", () => {
    it("accepts valid display name", () => {
      expect(validateCreateUserField("displayName", baseValues)).toBeNull();
      expect(validateDisplayName("An Nguyen")).toBeNull();
    });

    it("requires non-empty display name", () => {
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "",
        }),
      ).toBe("Enter a display name");
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "   ",
        }),
      ).toBe("Enter a display name");
      expect(validateDisplayName("")).toBe("Enter a display name");
      expect(validateDisplayName("   ")).toBe("Enter a display name");
    });

    it("rejects display name longer than 50 characters", () => {
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "a".repeat(51),
        }),
      ).toBe("Display name must be 50 characters or fewer");
      expect(validateDisplayName("a".repeat(51))).toBe(
        "Display name must be 50 characters or fewer",
      );
    });

    it("rejects invalid characters in display name", () => {
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "An\u0007",
        }),
      ).toBe("Contains characters that aren't allowed");
      expect(validateDisplayName("An\u0007")).toBe(
        "Contains characters that aren't allowed",
      );
    });
  });

  describe("email", () => {
    it("accepts valid email with surrounding whitespace", () => {
      expect(
        validateCreateUserField("email", {
          ...baseValues,
          email: "  an@openplany.dev  ",
        }),
      ).toBeNull();
      expect(validateEmail("  an@openplany.dev  ")).toBeNull();
    });

    it("rejects empty or invalid email formats", () => {
      expect(
        validateCreateUserField("email", { ...baseValues, email: "" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "invalid" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", {
          ...baseValues,
          email: "no-domain@",
        }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", {
          ...baseValues,
          email: "@domain.com",
        }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "a@b" }),
      ).toBe("Enter a valid email");
      expect(validateEmail("")).toBe("Enter a valid email");
      expect(validateEmail("invalid")).toBe("Enter a valid email");
    });

    it("rejects email longer than 254 characters", () => {
      expect(
        validateCreateUserField("email", {
          ...baseValues,
          email: `${"a".repeat(250)}@test.com`,
        }),
      ).toBe("Enter a valid email");
      expect(validateEmail(`${"a".repeat(250)}@test.com`)).toBe(
        "Enter a valid email",
      );
    });
  });

  describe("password", () => {
    it("accepts password between 8 and 128 characters", () => {
      expect(validateCreateUserField("password", baseValues)).toBeNull();
      expect(
        validateCreateUserField("password", {
          ...baseValues,
          password: "a".repeat(128),
        }),
      ).toBeNull();
      expect(validatePassword("password123")).toBeNull();
      expect(validatePassword("a".repeat(128))).toBeNull();
    });

    it("rejects password shorter than 8 or longer than 128 characters", () => {
      expect(
        validateCreateUserField("password", {
          ...baseValues,
          password: "short",
        }),
      ).toBe("Use 8 to 128 characters");
      expect(
        validateCreateUserField("password", {
          ...baseValues,
          password: "a".repeat(129),
        }),
      ).toBe("Use 8 to 128 characters");
      expect(validatePassword("short")).toBe("Use 8 to 128 characters");
      expect(validatePassword("a".repeat(129))).toBe("Use 8 to 128 characters");
    });

    it("rejects password identical to email case-insensitively", () => {
      expect(
        validateCreateUserField("password", {
          ...baseValues,
          email: "an@openplany.dev",
          password: "AN@OpenPlany.dev",
        }),
      ).toBe("Password can't be the same as the email");
      expect(validatePassword("AN@OpenPlany.dev", "an@openplany.dev")).toBe(
        "Password can't be the same as the email",
      );
    });
  });

  describe("confirmPassword", () => {
    it("accepts matching confirmPassword", () => {
      expect(validateCreateUserField("confirmPassword", baseValues)).toBeNull();
      expect(validateConfirmPassword("password123", "password123")).toBeNull();
    });

    it("rejects empty or mismatching confirmPassword", () => {
      expect(
        validateCreateUserField("confirmPassword", {
          ...baseValues,
          confirmPassword: "",
        }),
      ).toBe("Passwords don't match");
      expect(
        validateCreateUserField("confirmPassword", {
          ...baseValues,
          confirmPassword: "different-password",
        }),
      ).toBe("Passwords don't match");
      expect(validateConfirmPassword("", "password123")).toBe(
        "Passwords don't match",
      );
      expect(validateConfirmPassword("different-password", "password123")).toBe(
        "Passwords don't match",
      );
    });
  });

  describe("validateEditUserField (RQ D35, AC-35)", () => {
    const cliUser: AdminUserResponse = {
      id: "cli-user-1",
      email: "kai@openplany.dev",
      firstName: "",
      lastName: "",
      displayName: "Kai",
      avatarUrl: null,
      isActive: true,
      isInstanceAdmin: true,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    };

    const regularUser: AdminUserResponse = {
      ...cliUser,
      id: "reg-user-1",
      firstName: "An",
      lastName: "Nguyen",
      displayName: "An Nguyen",
      email: "an@openplany.dev",
    };

    it("allows unchanged invalid fields like empty CLI firstName without error (AC-35)", () => {
      const values: EditUserValues = {
        firstName: "",
        lastName: "",
        displayName: "Kai",
        email: "kai-new@openplany.dev",
      };

      // firstName is unchanged (both empty) -> should be null, not "Enter a first name"
      expect(validateEditUserField("firstName", values, cliUser)).toBeNull();
      // email changed to valid -> null
      expect(validateEditUserField("email", values, cliUser)).toBeNull();
    });

    it("validates field when changed from original value", () => {
      // Changed from "An" to ""
      const valuesWithEmptyFirst: EditUserValues = {
        firstName: "",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "an@openplany.dev",
      };
      expect(
        validateEditUserField("firstName", valuesWithEmptyFirst, regularUser),
      ).toBe("Enter a first name");

      // Changed email to invalid
      const valuesWithInvalidEmail: EditUserValues = {
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "invalid-email",
      };
      expect(
        validateEditUserField("email", valuesWithInvalidEmail, regularUser),
      ).toBe("Enter a valid email");
    });
  });

  describe("hasEditUserChanges", () => {
    const user: AdminUserResponse = {
      id: "user-1",
      email: "an@openplany.dev",
      firstName: "An",
      lastName: "Nguyen",
      displayName: "An Nguyen",
      avatarUrl: null,
      isActive: true,
      isInstanceAdmin: false,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    };

    it("returns false when values match loadedUser", () => {
      const values: EditUserValues = {
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "an@openplany.dev",
      };
      expect(hasEditUserChanges(values, user)).toBe(false);
    });

    it("returns false when difference is only surrounding whitespace or case in email", () => {
      const values: EditUserValues = {
        firstName: " An ",
        lastName: " Nguyen ",
        displayName: " An Nguyen ",
        email: " AN@OpenPlany.dev ",
      };
      expect(hasEditUserChanges(values, user)).toBe(false);
    });

    it("returns true when any field differs", () => {
      expect(
        hasEditUserChanges(
          {
            firstName: "Binh",
            lastName: "Nguyen",
            displayName: "An Nguyen",
            email: "an@openplany.dev",
          },
          user,
        ),
      ).toBe(true);

      expect(
        hasEditUserChanges(
          {
            firstName: "An",
            lastName: "Nguyen",
            displayName: "An Nguyen",
            email: "an-new@openplany.dev",
          },
          user,
        ),
      ).toBe(true);
    });
  });

  describe("buildUpdateAdminUserPayload", () => {
    const user: AdminUserResponse = {
      id: "user-1",
      email: "an@openplany.dev",
      firstName: "An",
      lastName: "Nguyen",
      displayName: "An Nguyen",
      avatarUrl: null,
      isActive: true,
      isInstanceAdmin: false,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    };

    it("only includes fields that actually changed + expectedUpdatedAt", () => {
      const values: EditUserValues = {
        firstName: "An",
        lastName: "Nguyen",
        displayName: "An Nguyen",
        email: "an-new@openplany.dev",
      };
      const payload = buildUpdateAdminUserPayload(values, user);
      expect(payload).toEqual({
        expectedUpdatedAt: "2026-10-15T00:00:00.000Z",
        email: "an-new@openplany.dev",
      });
      expect(payload.firstName).toBeUndefined();
      expect(payload.lastName).toBeUndefined();
      expect(payload.displayName).toBeUndefined();
    });

    it("sends empty string when lastName is cleared", () => {
      const values: EditUserValues = {
        firstName: "An",
        lastName: "",
        displayName: "An Nguyen",
        email: "an@openplany.dev",
      };
      const payload = buildUpdateAdminUserPayload(values, user);
      expect(payload).toEqual({
        expectedUpdatedAt: "2026-10-15T00:00:00.000Z",
        lastName: "",
      });
    });
  });

  describe("adminUserLabel", () => {
    it("returns displayName if present", () => {
      expect(
        adminUserLabel({
          displayName: "An Nguyen",
          firstName: "An",
          lastName: "Nguyen",
          email: "an@openplany.dev",
        }),
      ).toBe("An Nguyen");
    });

    it("falls back to fullName if displayName is empty", () => {
      expect(
        adminUserLabel({
          displayName: "",
          firstName: "An",
          lastName: "Nguyen",
          email: "an@openplany.dev",
        }),
      ).toBe("An Nguyen");
    });

    it("falls back to email if displayName and fullName are empty", () => {
      expect(
        adminUserLabel({
          displayName: "",
          firstName: "",
          lastName: null,
          email: "an@openplany.dev",
        }),
      ).toBe("an@openplany.dev");
    });
  });
});

