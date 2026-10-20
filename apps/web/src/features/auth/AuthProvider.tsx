import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "./api/authApi";
import type { AuthSession, AuthUser, SignInRequest } from "./api/authTypes";
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "./authContext";

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * What one /auth/session recheck found. "superseded": replaceSession,
 * signIn or signOut ran while it was in flight, so its answer is stale and
 * nothing is decided from it.
 */
type RecheckOutcome = "kept" | "expired" | "superseded";

/** Remounting the signed-in tree twice within this window is a loop (WEB B2.5). */
const KEPT_LOOP_WINDOW_MS = 10_000;

/** Holds who is signed in; the server-side session is the source of truth. */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const generationRef = useRef(0);
  const lastKeptAtRef = useRef<number | null>(null);
  const recheckPromiseRef = useRef<Promise<RecheckOutcome> | null>(null);
  const expirePromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const gen = generationRef.current;
    authApi.getSession().then(
      (session) => {
        if (cancelled || generationRef.current !== gen) return;
        setState(
          session === null
            ? { status: "anonymous" }
            : { status: "authenticated", session },
        );
      },
      (error: unknown) => {
        if (cancelled || generationRef.current !== gen) return;
        // The form stays usable; sign-in reports its own errors.
        console.error("Could not check the current session", error);
        setState({ status: "anonymous" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const replaceSession = useCallback((session: AuthSession) => {
    generationRef.current += 1;
    lastKeptAtRef.current = null;
    setState({ status: "authenticated", session });
  }, []);

  // Concurrent callers share one request and therefore one answer.
  const runRecheck = useCallback((): Promise<RecheckOutcome> => {
    if (recheckPromiseRef.current) {
      return recheckPromiseRef.current;
    }

    const genBefore = generationRef.current;
    const promise = (async (): Promise<RecheckOutcome> => {
      try {
        const session = await authApi.getSession();
        if (generationRef.current !== genBefore) {
          return "superseded";
        }
        if (session === null) {
          lastKeptAtRef.current = null;
          setState({ status: "anonymous" });
          return "expired";
        }
        setState((current) => {
          if (
            current.status === "authenticated" &&
            current.session.user.id === session.user.id &&
            current.session.requiresPasswordReset ===
              session.requiresPasswordReset
          ) {
            return current;
          }
          return { status: "authenticated", session };
        });
        return "kept";
      } catch (error: unknown) {
        if (generationRef.current !== genBefore) {
          return "superseded";
        }
        console.error("Could not check the current session on recheck", error);
        lastKeptAtRef.current = null;
        setState({ status: "anonymous" });
        return "expired";
      } finally {
        recheckPromiseRef.current = null;
      }
    })();

    recheckPromiseRef.current = promise;
    return promise;
  }, []);

  /** A newer session (replaceSession, signIn) is still a session: "kept". */
  const recheckSession = useCallback(
    async (): Promise<"kept" | "expired"> =>
      (await runRecheck()) === "expired" ? "expired" : "kept",
    [runRecheck],
  );

  // One decision per recheck, however many components saw a 401 at once.
  const expireSession = useCallback(() => {
    if (expirePromiseRef.current) return;

    const handled = runRecheck()
      .then((outcome) => {
        // "expired" already set anonymous; "superseded" is stale, so it
        // neither remounts nor counts toward the loop window.
        if (outcome !== "kept") return;
        const now = Date.now();
        if (
          lastKeptAtRef.current !== null &&
          now - lastKeptAtRef.current < KEPT_LOOP_WINDOW_MS
        ) {
          console.error(
            "Session recheck loop detected within 10s window; expiring session",
          );
          lastKeptAtRef.current = null;
          setState({ status: "anonymous" });
          return;
        }
        lastKeptAtRef.current = now;
        setSessionEpoch((epoch) => epoch + 1);
      })
      .catch((error: unknown) => {
        console.error("Unexpected error in expireSession", error);
      })
      .finally(() => {
        expirePromiseRef.current = null;
      });
    expirePromiseRef.current = handled;
  }, [runRecheck]);

  const signIn = useCallback(async (values: SignInRequest) => {
    const session = await authApi.signIn(values);
    generationRef.current += 1;
    lastKeptAtRef.current = null;
    setState({ status: "authenticated", session });
    return session;
  }, []);

  const signOut = useCallback(async () => {
    generationRef.current += 1;
    lastKeptAtRef.current = null;
    try {
      await authApi.signOut();
    } finally {
      // Forget the session locally even if the request failed.
      setState({ status: "anonymous" });
    }
  }, []);

  const updateUser = useCallback((user: AuthUser) => {
    setState((current) =>
      current.status === "authenticated"
        ? { status: "authenticated", session: { ...current.session, user } }
        : current,
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      sessionEpoch,
      signIn,
      signOut,
      updateUser,
      replaceSession,
      expireSession,
      recheckSession,
    }),
    [
      state,
      sessionEpoch,
      signIn,
      signOut,
      updateUser,
      replaceSession,
      expireSession,
      recheckSession,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
