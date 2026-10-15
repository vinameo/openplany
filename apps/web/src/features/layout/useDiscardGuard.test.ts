import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDiscardGuard } from "./useDiscardGuard";

describe("useDiscardGuard", () => {
  it("closes directly without confirmation when there are no changes", () => {
    const onDiscard = vi.fn();
    const { result } = renderHook(() =>
      useDiscardGuard({
        hasChanges: false,
        onDiscard,
      }),
    );

    expect(result.current.isConfirmingDiscard).toBe(false);

    act(() => {
      result.current.requestClose();
    });

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(result.current.isConfirmingDiscard).toBe(false);
  });

  it("asks for confirmation on first requestClose when changes exist", () => {
    const onDiscard = vi.fn();
    const { result } = renderHook(() =>
      useDiscardGuard({
        hasChanges: true,
        onDiscard,
      }),
    );

    expect(result.current.isConfirmingDiscard).toBe(false);

    act(() => {
      result.current.requestClose();
    });

    expect(onDiscard).not.toHaveBeenCalled();
    expect(result.current.isConfirmingDiscard).toBe(true);
  });

  it("cancels discard confirmation when cancelDiscard is called", () => {
    const onDiscard = vi.fn();
    const { result } = renderHook(() =>
      useDiscardGuard({
        hasChanges: true,
        onDiscard,
      }),
    );

    act(() => {
      result.current.requestClose();
    });
    expect(result.current.isConfirmingDiscard).toBe(true);

    act(() => {
      result.current.cancelDiscard();
    });
    expect(result.current.isConfirmingDiscard).toBe(false);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("does not close or confirm when isSaving is true", () => {
    const onDiscard = vi.fn();
    const { result } = renderHook(() =>
      useDiscardGuard({
        hasChanges: true,
        isSaving: true,
        onDiscard,
      }),
    );

    act(() => {
      result.current.requestClose();
    });

    expect(onDiscard).not.toHaveBeenCalled();
    expect(result.current.isConfirmingDiscard).toBe(false);
  });
});
