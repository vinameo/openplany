import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProjectListItem } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";
import {
  createContentFingerprint,
  useCreateWorkItemForm,
} from "./useCreateWorkItemForm";

const mockProject: ProjectListItem = {
  id: "proj-1",
  name: "Operations",
  identifier: "OPS",
  description: "",
  icon: { name: "square-check", color: "#868E96" },
  coverKey: "cover-01",
  timezone: "UTC",
  effectiveTimezone: "UTC",
  members: null,
  memberCount: 0,
  role: "contributor",
  permissions: ["project.workitems.create", "project.workitems.view"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

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

  it("includes stateId in content fingerprint so selecting a different state changes key (RQ INV-10)", () => {
    const fpDefault = createContentFingerprint("Task 1", "Description");
    const fpNull = createContentFingerprint("Task 1", "Description", null);
    const fpBacklog = createContentFingerprint(
      "Task 1",
      "Description",
      "state-backlog",
    );
    const fpReview = createContentFingerprint(
      "Task 1",
      "Description",
      "state-review",
    );

    expect(fpDefault).toBe(fpNull);
    expect(fpDefault).not.toBe(fpBacklog);
    expect(fpBacklog).not.toBe(fpReview);
  });

  it("supports object signature and includes priorityId in fingerprint (RQ INV-06, D8)", () => {
    const fpDefault = createContentFingerprint({
      title: "Task 1",
      description: "Description",
    });
    const fpNull = createContentFingerprint({
      title: "Task 1",
      description: "Description",
      priorityId: null,
    });
    const fpUrgent = createContentFingerprint({
      title: "Task 1",
      description: "Description",
      priorityId: "prio-urgent",
    });
    const fpHigh = createContentFingerprint({
      title: "Task 1",
      description: "Description",
      priorityId: "prio-high",
    });

    expect(fpDefault).toBe(fpNull);
    expect(fpDefault).not.toBe(fpUrgent);
    expect(fpUrgent).not.toBe(fpHigh);

    // Positional matches object signature
    const fpPositional = createContentFingerprint(
      "Task 1",
      "Description",
      undefined,
      "prio-urgent",
    );
    expect(fpUrgent).toBe(fpPositional);
  });
});

describe("useCreateWorkItemForm priority handling", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }

  it("marks hasChanges as true when selectedPriorityId is non-null and resets on resetForm", () => {
    const { result } = renderHook(
      () =>
        useCreateWorkItemForm({
          slug: "acme",
          project: mockProject,
        }),
      { wrapper },
    );

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.setSelectedPriorityId("prio-urgent");
    });

    expect(result.current.selectedPriorityId).toBe("prio-urgent");
    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.resetForm();
    });

    expect(result.current.selectedPriorityId).toBeNull();
    expect(result.current.hasChanges).toBe(false);
  });

  it("sends priorityId in body when selectedPriorityId is non-null", async () => {
    let capturedBody: unknown;
    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": async (init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse(201, {
          workItem: {
            id: "wi-1",
            number: 1,
            key: "OPS-1",
            title: "Priority Task",
            description: "",
            priorityId: "prio-urgent",
            createdById: "user-1",
            createdAt: new Date().toISOString(),
          },
        });
      },
    });

    const { result } = renderHook(
      () =>
        useCreateWorkItemForm({
          slug: "acme",
          project: mockProject,
        }),
      { wrapper },
    );

    act(() => {
      result.current.setTitle("Priority Task");
      result.current.setSelectedPriorityId("prio-urgent");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(capturedBody).toMatchObject({
      title: "Priority Task",
      priorityId: "prio-urgent",
    });
  });

  it("handles 409 PRIORITY_UNAVAILABLE by resetting priority, deleting fingerprint from map, and setting error", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () =>
        apiError(
          409,
          "PRIORITY_UNAVAILABLE",
          "The selected priority is no longer available. Please select another.",
        ),
    });

    const { result } = renderHook(
      () =>
        useCreateWorkItemForm({
          slug: "acme",
          project: mockProject,
        }),
      { wrapper },
    );

    act(() => {
      result.current.setTitle("Task with Deleted Priority");
      result.current.setSelectedPriorityId("prio-deleted");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.selectedPriorityId).toBeNull();
    expect(result.current.serverError).toBe(
      "This priority is no longer available. Choose another one and save again.",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["priorities", "project", "acme", "OPS"],
    });

    // Fingerprint should be cleared from map
    const fp = createContentFingerprint({
      title: "Task with Deleted Priority",
      description: "",
      priorityId: "prio-deleted",
    });
    expect(result.current.idempotencyMapRef.current.has(fp)).toBe(false);
  });

  it("handles 400 VALIDATION_ERROR on fields.priorityId by resetting priority, invalidating cache, and setting error", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mockFetch({
      "POST /api/workspaces/acme/projects/OPS/work-items": () =>
        apiError(400, "VALIDATION_ERROR", "Validation failed", {
          fields: { priorityId: "Invalid priority" },
        }),
    });

    const { result } = renderHook(
      () =>
        useCreateWorkItemForm({
          slug: "acme",
          project: mockProject,
        }),
      { wrapper },
    );

    act(() => {
      result.current.setTitle("Task with Invalid Priority");
      result.current.setSelectedPriorityId("bad-uuid");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(result.current.selectedPriorityId).toBeNull();
    expect(result.current.serverError).toBe("Choose a priority from the list");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["priorities", "project", "acme", "OPS"],
    });
  });
});
