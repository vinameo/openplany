import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { projectKeys } from "../../../projects/api/projectQueries";
import { workspaceApi } from "../../api/workspaceApi";
import { useGeneralSettingsForm } from "./useGeneralSettingsForm";
import { makeWorkspace } from "../../test/workspaceFixtures";

const navigateMock = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({
    expireSession: vi.fn(),
  }),
}));

const applyWorkspaceUpdateMock = vi.fn();
const reloadMock = vi.fn();
vi.mock("../../currentWorkspace/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    applyWorkspaceUpdate: applyWorkspaceUpdateMock,
    reload: reloadMock,
  }),
}));

const refreshMock = vi.fn();
vi.mock("../../useWorkspaces", () => ({
  useWorkspaces: () => ({
    refresh: refreshMock,
  }),
}));

describe("useGeneralSettingsForm", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("invalidates project list query when timezone changes on submit (R-5)", async () => {
    const ws = makeWorkspace({ slug: "my-ws", timezone: "UTC" });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(workspaceApi, "update").mockResolvedValueOnce({
      ...ws,
      timezone: "Asia/Tokyo",
    });

    const { result } = renderHook(() => useGeneralSettingsForm(ws), {
      wrapper,
    });

    act(() => {
      result.current.form.setFieldValue("timezone", "Asia/Tokyo");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: projectKeys.list("my-ws"),
    });
  });

  it("does not invalidate project list query when timezone is unchanged on submit", async () => {
    const ws = makeWorkspace({
      slug: "my-ws",
      name: "Old Name",
      timezone: "UTC",
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    vi.spyOn(workspaceApi, "update").mockResolvedValueOnce({
      ...ws,
      name: "New Name",
    });

    const { result } = renderHook(() => useGeneralSettingsForm(ws), {
      wrapper,
    });

    act(() => {
      result.current.form.setFieldValue("name", "New Name");
    });

    await act(async () => {
      await result.current.handleSubmit();
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
