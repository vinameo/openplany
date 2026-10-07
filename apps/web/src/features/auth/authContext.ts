import { createContext } from "react";
import type { AuthSession, AuthUser, SignInRequest } from "./api/authTypes";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSession };

export interface AuthContextValue {
  state: AuthState;
  signIn: (values: SignInRequest) => Promise<AuthSession>;
  signOut: () => Promise<void>;
  /** Replaces the signed-in user with fresher data from the server. */
  updateUser: (user: AuthUser) => void;
  /** The server said 401: forget the session so RequireAuth sends us to sign-in. */
  expireSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
