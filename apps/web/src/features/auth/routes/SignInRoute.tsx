import { Navigate } from "react-router";
import { useDelayedFlag } from "../../../hooks/useDelayedFlag";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AuthLayout } from "../AuthLayout";
import { LoginPage, type LoginValues } from "../LoginPage";
import {
  FORGOT_PASSWORD_PATH,
  sessionDestination,
} from "../sessionDestination";
import { useAuth } from "../useAuth";

/** Show the form only if the session check takes longer than this. */
export const SESSION_CHECK_GRACE_MS = 300;

export function SignInRoute() {
  const { state, signIn } = useAuth();
  const showFormWhileLoading = useDelayedFlag(
    state.status === "loading",
    SESSION_CHECK_GRACE_MS,
  );
  useDocumentTitle("Sign in · OpenPlany");

  if (state.status === "authenticated") {
    return <Navigate to={sessionDestination(state.session)} replace />;
  }
  if (state.status === "loading" && !showFormWhileLoading) {
    // Background only, so a signed-in user never sees the form flash.
    return <AuthLayout title="Sign in to OpenPlany" showCard={false} />;
  }

  async function handleSubmit(values: LoginValues): Promise<void> {
    // On success the auth state flips and the redirect above takes over.
    await signIn(values);
  }

  return (
    <LoginPage
      onSubmit={handleSubmit}
      forgotPasswordHref={FORGOT_PASSWORD_PATH}
    />
  );
}
