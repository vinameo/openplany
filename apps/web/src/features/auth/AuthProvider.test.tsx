import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, jsonResponse, mockFetch } from "../../test/fetchMock";
import { makeSession } from "../../test/authFixtures";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the initial session on mount", async () => {
    const session = makeSession();
    mockFetch({
      "GET /api/auth/session": () => jsonResponse(200, session),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.state.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.state.status).toBe("authenticated");
    });
    if (result.current.state.status === "authenticated") {
      expect(result.current.state.session.user.id).toBe(session.user.id);
    }
    expect(result.current.sessionEpoch).toBe(0);
  });

  it("becomes anonymous if initial session returns 401", async () => {
    mockFetch({
      "GET /api/auth/session": () =>
        apiError(401, "UNAUTHENTICATED", "No session"),
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("anonymous");
    });
  });

  describe("recheckSession", () => {
    it("keeps state and returns 'kept' when session is still active", async () => {
      const session = makeSession();
      mockFetch({
        "GET /api/auth/session": () => jsonResponse(200, session),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });

      let outcome: "kept" | "expired" | undefined;
      await act(async () => {
        outcome = await result.current.recheckSession();
      });

      expect(outcome).toBe("kept");
      expect(result.current.state.status).toBe("authenticated");
    });

    it("transitions to anonymous and returns 'expired' when session is null", async () => {
      const session = makeSession();
      let callCount = 0;
      mockFetch({
        "GET /api/auth/session": () => {
          callCount += 1;
          return callCount === 1
            ? jsonResponse(200, session)
            : apiError(401, "UNAUTHENTICATED", "Revoked");
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });

      let outcome: "kept" | "expired" | undefined;
      await act(async () => {
        outcome = await result.current.recheckSession();
      });

      expect(outcome).toBe("expired");
      expect(result.current.state.status).toBe("anonymous");
    });

    it("coalesces concurrent recheckSession calls into a single request", async () => {
      const session = makeSession();
      let sessionCalls = 0;
      mockFetch({
        "GET /api/auth/session": () => {
          sessionCalls += 1;
          return jsonResponse(200, session);
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });
      expect(sessionCalls).toBe(1);

      let outcomes: ("kept" | "expired")[] = [];
      await act(async () => {
        outcomes = await Promise.all([
          result.current.recheckSession(),
          result.current.recheckSession(),
        ]);
      });

      expect(outcomes).toEqual(["kept", "kept"]);
      // 1 initial load + 1 coalesced recheck call
      expect(sessionCalls).toBe(2);
    });

    it("lets replaceSession win if called while recheckSession is in flight", async () => {
      const session = makeSession();
      let resolveSessionFetch!: (res: Response) => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveSessionFetch = resolve;
      });

      let callCount = 0;
      mockFetch({
        "GET /api/auth/session": () => {
          callCount += 1;
          if (callCount === 1) return jsonResponse(200, session);
          return pendingFetch;
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });

      // Start recheck
      let recheckPromise!: Promise<"kept" | "expired">;
      act(() => {
        recheckPromise = result.current.recheckSession();
      });

      // While recheck is in flight, replaceSession is called (e.g. password change succeeded)
      const freshSession = makeSession({
        user: { ...session.user, id: "user-fresh" },
      });
      act(() => {
        result.current.replaceSession(freshSession);
      });

      // Now the old in-flight fetch resolves to null (e.g. 401 unauthenticated on old session)
      await act(async () => {
        resolveSessionFetch(apiError(401, "UNAUTHENTICATED", "Revoked"));
      });

      const outcome = await recheckPromise;
      expect(outcome).toBe("kept");
      expect(result.current.state.status).toBe("authenticated");
      if (result.current.state.status === "authenticated") {
        expect(result.current.state.session.user.id).toBe("user-fresh");
      }
    });
  });

  describe("expireSession", () => {
    it("increments sessionEpoch when recheck confirms session is kept", async () => {
      const session = makeSession();
      mockFetch({
        "GET /api/auth/session": () => jsonResponse(200, session),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });
      expect(result.current.sessionEpoch).toBe(0);

      act(() => {
        result.current.expireSession();
      });

      await waitFor(() => {
        expect(result.current.sessionEpoch).toBe(1);
      });
      expect(result.current.state.status).toBe("authenticated");
    });

    it("RQ R-04: detects loop and forces anonymous if kept twice within 10 seconds", async () => {
      const session = makeSession();
      mockFetch({
        "GET /api/auth/session": () => jsonResponse(200, session),
      });

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });

      // First expireSession at t = 0 -> kept, sessionEpoch increments to 1
      act(() => {
        result.current.expireSession();
      });

      await waitFor(() => {
        expect(result.current.sessionEpoch).toBe(1);
      });

      // Second expireSession 2 seconds later (within 10s loop window)
      vi.setSystemTime(Date.now() + 2_000);

      act(() => {
        result.current.expireSession();
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("anonymous");
      });
      // sessionEpoch does not increment further on loop detection
      expect(result.current.sessionEpoch).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("loop detected"),
      );
    });

    it("allows another sessionEpoch increment after 10 seconds", async () => {
      const session = makeSession();
      mockFetch({
        "GET /api/auth/session": () => jsonResponse(200, session),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("authenticated");
      });

      // First expireSession at t = 0
      act(() => {
        result.current.expireSession();
      });

      await waitFor(() => {
        expect(result.current.sessionEpoch).toBe(1);
      });

      // Advance by 11 seconds (outside 10s window)
      vi.setSystemTime(Date.now() + 11_000);

      act(() => {
        result.current.expireSession();
      });

      await waitFor(() => {
        expect(result.current.sessionEpoch).toBe(2);
      });
      expect(result.current.state.status).toBe("authenticated");
    });
  });
});
