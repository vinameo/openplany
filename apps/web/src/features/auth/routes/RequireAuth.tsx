import { Navigate, Outlet } from "react-router";
import { AuthLayout } from "../AuthLayout";
import { SET_PASSWORD_PATH, SIGN_IN_PATH } from "../sessionDestination";
import { useAuth } from "../useAuth";

/** Gate for app routes: signed in with a full (not reset-only) session. */
export function RequireAuth() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return <AuthLayout title="OpenPlany" showCard={false} />;
  }
  if (state.status === "anonymous") {
    return <Navigate to={SIGN_IN_PATH} replace />;
  }
  if (state.session.requiresPasswordReset) {
    return <Navigate to={SET_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}
