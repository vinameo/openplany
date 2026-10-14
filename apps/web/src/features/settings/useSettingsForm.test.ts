import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, GENERIC_ERROR_KEY } from "../../lib/apiClient";
import { useSettingsForm } from "./useSettingsForm";
import { translate } from "../../i18n/language";

const GENERIC_ERROR = translate(GENERIC_ERROR_KEY);

const expireSessionMock = vi.fn();
vi.mock("../auth/useAuth", () => ({
  useAuth: () => ({
    expireSession: expireSessionMock,
  }),
}));

describe("useSettingsForm", () => {
  it("reloads values when sourceVersion changes and form is not dirty", () => {
    let source = { name: "Original", role: "admin" };
    let sourceVersion = "v1";

    const { result, rerender } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion,
        fields: ["name"] as const,
        submit: async (c) => ({ ...source, ...c }),
      }),
    );

    expect(result.current.form.values.name).toBe("Original");

    source = { name: "Updated From Server", role: "admin" };
    sourceVersion = "v2";
    rerender();

    expect(result.current.form.values.name).toBe("Updated From Server");
  });

  it("preserves user edits when sourceVersion changes and form is dirty", () => {
    let source = { name: "Original", role: "admin" };
    let sourceVersion = "v1";

    const { result, rerender } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion,
        fields: ["name"] as const,
        submit: async (c) => ({ ...source, ...c }),
      }),
    );

    act(() => {
      result.current.form.setFieldValue("name", "User Typed");
    });

    expect(result.current.form.values.name).toBe("User Typed");
    expect(result.current.hasChanges).toBe(true);

    source = { name: "Updated From Server", role: "admin" };
    sourceVersion = "v2";
    rerender();

    // User edits must NOT be overwritten
    expect(result.current.form.values.name).toBe("User Typed");
  });

  it("does not consider trailing spaces as changes when normalize trims", () => {
    const source = { name: "My Workspace" };

    const { result } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion: "v1",
        fields: ["name"] as const,
        normalize: {
          name: (v) => v.trim(),
        },
        submit: async (c) => ({ ...source, ...c }),
      }),
    );

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.form.setFieldValue("name", "My Workspace   ");
    });

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.form.setFieldValue("name", "My Workspace 2");
    });

    expect(result.current.hasChanges).toBe(true);
  });

  it("handles 409 with field error on known input", async () => {
    const source = { name: "Duplicate Name" };
    const submit = vi.fn().mockRejectedValue(
      new ApiRequestError(409, {
        code: "CONFLICT",
        message: "Conflict",
        fields: {
          name: "Project name already exists",
        },
      }),
    );

    const { result } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion: "v1",
        fields: ["name"] as const,
        submit,
      }),
    );

    act(() => {
      result.current.form.setFieldValue("name", "Changed");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.form.errors.name).toBe("Project name already exists");
    expect(result.current.submitError).toBeNull();
  });

  it("handles 400/409 with hidden field error by putting it into submitError", async () => {
    const source = { name: "My Project" };
    const submit = vi.fn().mockRejectedValue(
      new ApiRequestError(400, {
        code: "BAD_REQUEST",
        message: "Bad Request",
        fields: {
          coverKey: "Cover key is invalid",
          "icon.color": "Icon color is invalid",
        },
      }),
    );

    const { result } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion: "v1",
        fields: ["name"] as const,
        submit,
      }),
    );

    act(() => {
      result.current.form.setFieldValue("name", "Changed");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.submitError).toBe("Cover key is invalid");
  });

  it("handles non-ApiRequestError by setting GENERIC_ERROR", async () => {
    const source = { name: "My Project" };
    const submit = vi.fn().mockRejectedValue(new Error("Network failed"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion: "v1",
        fields: ["name"] as const,
        submit,
      }),
    );

    act(() => {
      result.current.form.setFieldValue("name", "Changed");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.submitError).toBe(GENERIC_ERROR);
    consoleSpy.mockRestore();
  });

  it("handles 401 error by expiring session", async () => {
    const source = { name: "My Project" };
    const submit = vi.fn().mockRejectedValue(
      new ApiRequestError(401, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      }),
    );

    const { result } = renderHook(() =>
      useSettingsForm({
        source,
        sourceVersion: "v1",
        fields: ["name"] as const,
        submit,
      }),
    );

    act(() => {
      result.current.form.setFieldValue("name", "Changed");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(expireSessionMock).toHaveBeenCalled();
  });
});
