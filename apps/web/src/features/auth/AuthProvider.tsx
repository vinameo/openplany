import { useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi } from "./api/authApi";
import type { SignInRequest } from "./api/authTypes";
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

  useEffect(() => {
    let cancelled = false;
    authApi.getSession().then(
      (session) => {
        if (cancelled) return;
        setState(
          session === null
            ? { status: "anonymous" }
            : { status: "authenticated", session },
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        // The form stays usable; sign-in reports its own errors.
        console.error("Could not check the current session", error);
        setState({ status: "anonymous" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signIn(values: SignInRequest) {
        const session = await authApi.signIn(values);
        setState({ status: "authenticated", session });
        return session;
      },
      async signOut() {
        try {
          await authApi.signOut();
        } finally {
          // Forget the session locally even if the request failed.
          setState({ status: "anonymous" });
        }
      },
    }),
    [state],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
