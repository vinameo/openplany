import { Button, Text } from "@mantine/core";
import { Navigate } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AuthLayout } from "../AuthLayout";
import { HOME_PATH, SIGN_IN_PATH } from "../sessionDestination";
import { useAuth } from "../useAuth";
import classes from "./AuthRoutes.module.css";

/**
 * Landing screen for rule 9 (password expired / reset required). The
 * change-required endpoint is not built yet, so this only explains and lets
 * the user leave.
 */
export function SetPasswordRoute() {
  const { state, signOut } = useAuth();
  useDocumentTitle("Set a new password · OpenPlany");

  if (state.status === "loading") {
    return <AuthLayout title="Set a new password" showCard={false} />;
  }
  if (state.status === "anonymous") {
    return <Navigate to={SIGN_IN_PATH} replace />;
  }
  if (!state.session.requiresPasswordReset) {
    return <Navigate to={HOME_PATH} replace />;
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle="Your password has to be changed before you continue."
    >
      <Text className={classes.text}>
        Changing it here isn&apos;t available yet. Ask your admin to reset your
        password.
      </Text>
      <Button
        fullWidth
        variant="default"
        className={classes.action}
        onClick={() => void signOut()}
      >
        Back to sign in
      </Button>
    </AuthLayout>
  );
}
