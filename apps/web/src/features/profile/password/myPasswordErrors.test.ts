import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../lib/apiClient";
import { resolveMyPasswordError } from "./myPasswordErrors";

describe("resolveMyPasswordError", () => {
  const t = vi.fn(
    (key: string, options?: Record<string, unknown>) =>
      `${key}${options?.count !== undefined ? `:${options.count}` : ""}`,
  );

  it("handles 401 UNAUTHENTICATED", () => {
    const error = new ApiRequestError(401, {
      code: "UNAUTHENTICATED",
      message: "Ignored message",
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({ kind: "unauthenticated" });
  });

  it("handles CURRENT_PASSWORD_INCORRECT", () => {
    const error = new ApiRequestError(400, {
      code: "CURRENT_PASSWORD_INCORRECT",
      message: "Ignored message",
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "fieldErrors",
      fieldErrors: {
        currentPassword: "users:errors.currentPasswordIncorrect",
      },
      focusField: "currentPassword",
    });
  });

  it("handles VALIDATION_ERROR with fields", () => {
    const error = new ApiRequestError(400, {
      code: "VALIDATION_ERROR",
      message: "Ignored message",
      fields: {
        currentPassword: "Enter your current password",
        newPassword: "Too short",
      },
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "fieldErrors",
      fieldErrors: {
        currentPassword: "Enter your current password",
        newPassword: "Too short",
      },
      submitError: undefined,
      focusField: "currentPassword",
    });
  });

  it("handles VALIDATION_ERROR with unexpected fields as general error", () => {
    const error = new ApiRequestError(400, {
      code: "VALIDATION_ERROR",
      message: "Ignored message",
      fields: {
        randomField: "Some error",
      },
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "submitError",
      submitError: "profile:password.errors.failed",
    });
  });

  it("handles TOO_MANY_PASSWORD_ATTEMPTS with ceil of retryAfterSeconds", () => {
    const error = new ApiRequestError(429, {
      code: "TOO_MANY_PASSWORD_ATTEMPTS",
      message: "Ignored message",
      retryAfterSeconds: 840, // 14 mins
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "submitError",
      submitError: "users:errors.tooManyPasswordAttempts:14",
    });

    const errorEdge = new ApiRequestError(429, {
      code: "TOO_MANY_PASSWORD_ATTEMPTS",
      message: "Ignored message",
      retryAfterSeconds: 30, // < 1 min, ceil to 1
    });
    const resultEdge = resolveMyPasswordError(errorEdge, t);
    expect(resultEdge).toEqual({
      kind: "submitError",
      submitError: "users:errors.tooManyPasswordAttempts:1",
    });
  });

  it("handles TOO_MANY_PASSWORD_CHANGES with ceil of retryAfterSeconds", () => {
    const error = new ApiRequestError(429, {
      code: "TOO_MANY_PASSWORD_CHANGES",
      message: "Ignored message",
      retryAfterSeconds: 600, // 10 mins
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "submitError",
      submitError: "users:errors.tooManyPasswordChanges:10",
    });
  });

  it("handles PASSWORD_CHANGED_ELSEWHERE", () => {
    const error = new ApiRequestError(409, {
      code: "PASSWORD_CHANGED_ELSEWHERE",
      message: "Ignored message",
    });
    const result = resolveMyPasswordError(error, t);
    expect(result).toEqual({
      kind: "submitError",
      submitError: "users:errors.passwordChangedElsewhere",
    });
  });

  it("falls back to profile:password.errors.failed for unknown or network error without reading error.message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const netError = new TypeError("Connection refused");
    const result = resolveMyPasswordError(netError, t);
    expect(result).toEqual({
      kind: "submitError",
      submitError: "profile:password.errors.failed",
    });
    expect(spy).toHaveBeenCalledWith(
      "Change password request failed",
      netError,
    );
    spy.mockRestore();
  });
});
