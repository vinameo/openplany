import { createContext } from "react";
import type { AuthSession, SignInRequest } from "./api/authTypes";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; session: AuthSession };

export interface AuthContextValue {
  state: AuthState;
  signIn: (values: SignInRequest) => Promise<AuthSession>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
