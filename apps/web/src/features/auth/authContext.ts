import { createContext } from "react";
import type { AuthSession, AuthUser, SignInRequest } from "./api/authTypes";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSession };

export interface AuthContextValue {
  state: AuthState;
  sessionEpoch: number;
  signIn: (values: SignInRequest) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  /** Replaces the signed-in user with fresher data from the server. */
  updateUser: (user: AuthUser) => void;
  /** Replaces the session with a fresh session (e.g. after password change). */
  replaceSession: (session: AuthSession) => void;
  /** The server said 401: rechecks session and resets epoch if kept, or clears session if expired. */
  expireSession: () => void;
  /** Rechecks session with the server, coalescing calls and handling concurrent replaceSession. */
  recheckSession: () => Promise<"kept" | "expired">;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
