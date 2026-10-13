import { createElement, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ProjectListItem } from "@repo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../lib/apiClient";
import { createServerStateClient } from "../../../lib/serverStateClient";
import { useProject } from "./useProject";
import { apiError, jsonResponse, mockFetch } from "../../../test/fetchMock";

const auth = vi.hoisted(() => ({ expireSession: vi.fn() }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => auth }));

const project: ProjectListItem = {
  id: "p-11",
  name: "The First Project",
  identifier: "TFP11",
  description: "",
  icon: { name: "rocket", color: "#15AABF" },
  coverKey: "cover-01",
  createdAt: "2026-10-12T10:00:00.000Z",
  updatedAt: "2026-10-12T10:00:00.000Z",
  timezone: null,
  effectiveTimezone: "UTC",
  members: [],
  memberCount: 0,
  role: "admin",
  permissions: ["project.members.view"],
};

const URL_KEY = "GET /api/workspaces/the-firsts/projects/TFP11";

function render(slug: string, identifier: string | null) {
  const client = createServerStateClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useProject(slug, identifier), { wrapper });
}

describe("useProject", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    auth.expireSession.mockReset();
  });

  it("does not fetch without an identifier", () => {
    const fetchMock = mockFetch({});
    const { result } = render("the-firsts", null);
    expect(result.current.state).toEqual({ status: "idle" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores no raw error message: a failed load is just a retryable error", async () => {
    mockFetch({ [URL_KEY]: () => apiError(500, "INTERNAL_ERROR", "boom") });
    const { result } = render("the-firsts", "TFP11");
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error" }),
    );
  });

  it("replace shows a project from a write without refetching", async () => {
    const fetchMock = mockFetch({
      [URL_KEY]: () => jsonResponse(200, { project }),
    });
    const { result } = render("the-firsts", "TFP11");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    act(() => result.current.replace({ ...project, name: "Renamed" }));

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "ready",
        project: { ...project, name: "Renamed" },
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reload refetches while the project stays on screen", async () => {
    let name = "The First Project";
    mockFetch({
      [URL_KEY]: () => jsonResponse(200, { project: { ...project, name } }),
    });
    const { result } = render("the-firsts", "TFP11");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    name = "Renamed elsewhere";
    let reloading: Promise<void> = Promise.resolve();
    act(() => {
      reloading = result.current.reload();
    });
    expect(result.current.state.status).toBe("ready");
    await act(() => reloading);

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "ready",
        project: { ...project, name: "Renamed elsewhere" },
      }),
    );
  });

  it("reload rejects on a retryable failure and keeps the current project", async () => {
    let fail = false;
    mockFetch({
      [URL_KEY]: () =>
        fail
          ? apiError(500, "INTERNAL_ERROR", "boom")
          : jsonResponse(200, { project }),
    });
    const { result } = render("the-firsts", "TFP11");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    fail = true;
    let failure: unknown;
    await act(async () => {
      failure = await result.current.reload().then(
        () => null,
        (err: unknown) => err,
      );
    });
    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as ApiRequestError).status).toBe(500);
    expect(result.current.state).toEqual({ status: "ready", project });
  });

  it("reload moves to forbidden when access was removed", async () => {
    let forbidden = false;
    mockFetch({
      [URL_KEY]: () =>
        forbidden
          ? apiError(403, "FORBIDDEN", "no")
          : jsonResponse(200, { project }),
    });
    const { result } = render("the-firsts", "TFP11");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    forbidden = true;
    await act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "forbidden" }),
    );
  });
});
