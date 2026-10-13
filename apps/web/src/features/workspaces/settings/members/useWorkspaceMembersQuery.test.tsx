import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkspaceMemberListResponse } from "@repo/contracts";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../../../test/fetchMock";
import { useWorkspaceMembersQuery } from "./useWorkspaceMembersQuery";

const mockExpireSession = vi.fn();
const mockReloadWorkspace = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    expireSession: mockExpireSession,
  }),
}));

vi.mock("../../currentWorkspace/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    reload: mockReloadWorkspace,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const sampleResponse: WorkspaceMemberListResponse = {
  members: [
    {
      userId: "u-1",
      firstName: "Kai",
      lastName: "Tran",
      displayName: "kai",
      role: "admin",
      accountActive: true,
      avatarUrl: null,
      joinedAt: "2026-10-01T00:00:00.000Z",
      assignableRoles: [],
    },
  ],
  total: 1,
  truncated: false,
  addableRoles: ["admin", "member"],
};

describe("useWorkspaceMembersQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads members successfully", async () => {
    mockFetch({
      "GET /api/workspaces/test-ws/members": () =>
        jsonResponse(200, sampleResponse),
    });

    const { result } = renderHook(() => useWorkspaceMembersQuery("test-ws"), {
      wrapper: createWrapper(),
    });

    expect(result.current.state.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
    });

    if (result.current.state.status === "ready") {
      expect(result.current.state.data.members).toHaveLength(1);
      expect(result.current.state.data.total).toBe(1);
    }
  });

  it("triggers expireSession on 401", async () => {
    mockFetch({
      "GET /api/workspaces/test-ws/members": () =>
        apiError(401, "Unauthorized", "UNAUTHORIZED"),
    });

    renderHook(() => useWorkspaceMembersQuery("test-ws"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockExpireSession).toHaveBeenCalledTimes(1);
    });
  });

  it("triggers reloadWorkspace and enters forbidden state on 403", async () => {
    mockFetch({
      "GET /api/workspaces/test-ws/members": () =>
        apiError(403, "Forbidden", "FORBIDDEN"),
    });

    const { result } = renderHook(() => useWorkspaceMembersQuery("test-ws"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockReloadWorkspace).toHaveBeenCalledTimes(1);
      expect(result.current.state.status).toBe("error");
    });

    if (result.current.state.status === "error") {
      expect(result.current.state.message).toBe(
        "You no longer have permission to view members.",
      );
    }
  });

  it("returns generic error message on other errors", async () => {
    mockFetch({
      "GET /api/workspaces/test-ws/members": () =>
        apiError(500, "Internal Server Error", "INTERNAL_SERVER_ERROR"),
    });

    const { result } = renderHook(() => useWorkspaceMembersQuery("test-ws"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("error");
    });

    if (result.current.state.status === "error") {
      expect(result.current.state.message).toBe("Couldn't load members.");
    }
  });
});
