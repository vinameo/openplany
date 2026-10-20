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

/** Holds who is signed in; the server-side session is the source of truth. */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const generationRef = useRef(0);
  const lastKeptAtRef = useRef<number | null>(null);
  const recheckPromiseRef = useRef<Promise<"kept" | "expired"> | null>(null);

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

  const recheckSession = useCallback((): Promise<"kept" | "expired"> => {
    if (recheckPromiseRef.current) {
      return recheckPromiseRef.current;
    }

    const genBefore = generationRef.current;
    const promise = (async () => {
      try {
        const session = await authApi.getSession();
        if (generationRef.current !== genBefore) {
          return "kept";
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
          return "kept";
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

  const expireSession = useCallback(() => {
    void recheckSession()
      .then((outcome) => {
        if (outcome === "kept") {
          const now = Date.now();
          if (
            lastKeptAtRef.current !== null &&
            now - lastKeptAtRef.current < 10_000
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
        }
      })
      .catch((error: unknown) => {
        console.error("Unexpected error in expireSession", error);
      });
  }, [recheckSession]);

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
