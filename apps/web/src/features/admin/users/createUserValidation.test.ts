import { describe, expect, it } from "vitest";
import {
  type CreateUserValues,
  validateCreateUserField,
} from "./createUserValidation";

describe("createUserValidation", () => {
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
      // Khái vs Khái
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "Kha\u0301i",
        }),
      ).toBeNull();
    });

    it("requires non-empty name after normalization", () => {
      expect(
        validateCreateUserField("firstName", { ...baseValues, firstName: "" }),
      ).toBe("Enter a first name");
      expect(
        validateCreateUserField("firstName", { ...baseValues, firstName: "   " }),
      ).toBe("Enter a first name");
    });

    it("rejects names longer than 50 characters", () => {
      expect(
        validateCreateUserField("firstName", {
          ...baseValues,
          firstName: "a".repeat(51),
        }),
      ).toBe("First name must be 50 characters or fewer");
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
    });

    it("rejects last name longer than 50 characters", () => {
      expect(
        validateCreateUserField("lastName", {
          ...baseValues,
          lastName: "a".repeat(51),
        }),
      ).toBe("Last name must be 50 characters or fewer");
    });

    it("rejects invalid characters in last name", () => {
      expect(
        validateCreateUserField("lastName", {
          ...baseValues,
          lastName: "Nguyen\u200E",
        }),
      ).toBe("Contains characters that aren't allowed");
    });
  });

  describe("displayName", () => {
    it("accepts valid display name", () => {
      expect(validateCreateUserField("displayName", baseValues)).toBeNull();
    });

    it("requires non-empty display name", () => {
      expect(
        validateCreateUserField("displayName", { ...baseValues, displayName: "" }),
      ).toBe("Enter a display name");
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "   ",
        }),
      ).toBe("Enter a display name");
    });

    it("rejects display name longer than 50 characters", () => {
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "a".repeat(51),
        }),
      ).toBe("Display name must be 50 characters or fewer");
    });

    it("rejects invalid characters in display name", () => {
      expect(
        validateCreateUserField("displayName", {
          ...baseValues,
          displayName: "An\u0007",
        }),
      ).toBe("Contains characters that aren't allowed");
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
    });

    it("rejects empty or invalid email formats", () => {
      expect(
        validateCreateUserField("email", { ...baseValues, email: "" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "invalid" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "no-domain@" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "@domain.com" }),
      ).toBe("Enter a valid email");
      expect(
        validateCreateUserField("email", { ...baseValues, email: "a@b" }),
      ).toBe("Enter a valid email");
    });

    it("rejects email longer than 254 characters", () => {
      expect(
        validateCreateUserField("email", {
          ...baseValues,
          email: `${"a".repeat(250)}@test.com`,
        }),
      ).toBe("Enter a valid email");
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
    });

    it("rejects password identical to email case-insensitively", () => {
      expect(
        validateCreateUserField("password", {
          ...baseValues,
          email: "an@openplany.dev",
          password: "AN@OpenPlany.dev",
        }),
      ).toBe("Password can't be the same as the email");
    });
  });

  describe("confirmPassword", () => {
    it("accepts matching confirmPassword", () => {
      expect(validateCreateUserField("confirmPassword", baseValues)).toBeNull();
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
    });
  });
});

