import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSettingsForm } from "./useSettingsForm";

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    expireSession: vi.fn(),
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
});

