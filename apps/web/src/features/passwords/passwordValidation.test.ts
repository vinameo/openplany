import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../../i18n/index.js";
import {
  validateConfirmPassword,
  validatePassword,
  validatePasswordNotCurrent,
} from "./passwordValidation.js";

describe("passwordValidation (WEB B2.1, B5, RQ INV-04, AC-08)", () => {
  beforeEach(() => {
    setLanguage("en");
  });

  afterEach(() => {
    setLanguage("en");
  });

  describe("validatePassword", () => {
    it("accepts valid passwords between 8 and 128 characters", () => {
      expect(validatePassword("password123")).toBeNull();
      expect(validatePassword("a".repeat(8))).toBeNull();
      expect(validatePassword("a".repeat(128))).toBeNull();
    });

    it("rejects password shorter than 8 characters", () => {
      expect(validatePassword("short")).toBe("Use 8 to 128 characters");
      expect(validatePassword("")).toBe("Use 8 to 128 characters");
    });

    it("rejects password longer than 128 characters", () => {
      expect(validatePassword("a".repeat(129))).toBe("Use 8 to 128 characters");
    });

    it("rejects password matching email case-insensitively", () => {
      expect(validatePassword("test@example.com", "test@example.com")).toBe(
        "Password can't be the same as the email",
      );
      expect(validatePassword("TEST@EXAMPLE.COM", "test@example.com")).toBe(
        "Password can't be the same as the email",
      );
      expect(validatePassword("test@example.com", "  TEST@EXAMPLE.COM  ")).toBe(
        "Password can't be the same as the email",
      );
    });

    it("allows password different from email", () => {
      expect(
        validatePassword("mySecretPassword", "test@example.com"),
      ).toBeNull();
    });

    it("translates validation errors into Vietnamese", () => {
      setLanguage("vi");
      expect(validatePassword("short")).toBe("Dùng từ 8 đến 128 ký tự");
      expect(validatePassword("test@example.com", "test@example.com")).toBe(
        "Mật khẩu không được trùng với email",
      );
    });
  });

  describe("validateConfirmPassword", () => {
    it("accepts matching passwords", () => {
      expect(
        validateConfirmPassword("mySecretPass1", "mySecretPass1"),
      ).toBeNull();
    });

    it("rejects empty confirm password", () => {
      expect(validateConfirmPassword("", "mySecretPass1")).toBe(
        "Passwords don't match",
      );
    });

    it("rejects non-matching confirm password", () => {
      expect(validateConfirmPassword("otherPass", "mySecretPass1")).toBe(
        "Passwords don't match",
      );
    });

    it("translates mismatch error into Vietnamese", () => {
      setLanguage("vi");
      expect(validateConfirmPassword("otherPass", "mySecretPass1")).toBe(
        "Mật khẩu không khớp",
      );
    });
  });

  describe("validatePasswordNotCurrent", () => {
    it("accepts different new and current passwords", () => {
      expect(
        validatePasswordNotCurrent("newPassword123", "currentPassword123"),
      ).toBeNull();
    });

    it("allows non-empty new password when current password is empty", () => {
      expect(validatePasswordNotCurrent("newPassword123", "")).toBeNull();
    });

    it("rejects when new password matches current password exactly", () => {
      expect(
        validatePasswordNotCurrent("samePassword123", "samePassword123"),
      ).toBe("Choose a password different from your current one");
    });

    it("translates same-as-current error into Vietnamese", () => {
      setLanguage("vi");
      expect(
        validatePasswordNotCurrent("samePassword123", "samePassword123"),
      ).toBe("Hãy chọn mật khẩu khác mật khẩu hiện tại");
    });
  });
});
