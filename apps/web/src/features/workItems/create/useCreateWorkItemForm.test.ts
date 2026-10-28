import { describe, expect, it } from "vitest";
import { createContentFingerprint } from "./useCreateWorkItemForm";

describe("createContentFingerprint", () => {
  it("normalizes title whitespace and description CRLF and produces identical fingerprint", () => {
    const fp1 = createContentFingerprint("My Task", "Line 1\nLine 2");
    const fp2 = createContentFingerprint("  My Task  ", "Line 1\r\nLine 2");
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different content", () => {
    const fp1 = createContentFingerprint("Task 1", "Description");
    const fp2 = createContentFingerprint("Task 2", "Description");
    const fp3 = createContentFingerprint("Task 1", "Different description");

    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
    expect(fp2).not.toBe(fp3);
  });
});
