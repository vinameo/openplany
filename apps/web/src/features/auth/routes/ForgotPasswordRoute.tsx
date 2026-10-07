import { Anchor, Text } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AuthLayout } from "../AuthLayout";
import { SIGN_IN_PATH } from "../sessionDestination";
import classes from "./AuthRoutes.module.css";

/** Placeholder until the forgot-password flow ships (api-spec 3.4). */
export function ForgotPasswordRoute() {
  useDocumentTitle("Forgot password · OpenPlany");

  return (
    <AuthLayout title="Forgot your password?">
      <Text className={classes.text}>
        Password reset by email isn&apos;t available yet. Ask your admin to
        reset your password.
      </Text>
      <Text className={classes.text} mt="lg">
        <Anchor component={Link} to={SIGN_IN_PATH}>
          Back to sign in
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
