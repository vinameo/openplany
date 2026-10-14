import { Button, Text } from "@mantine/core";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  useDocumentTitle(t("auth:setPassword.documentTitle"));

  if (state.status === "loading") {
    return <AuthLayout title={t("auth:setPassword.title")} showCard={false} />;
  }
  if (state.status === "anonymous") {
    return <Navigate to={SIGN_IN_PATH} replace />;
  }
  if (!state.session.requiresPasswordReset) {
    return <Navigate to={HOME_PATH} replace />;
  }

  return (
    <AuthLayout
      title={t("auth:setPassword.title")}
      subtitle={t("auth:setPassword.subtitle")}
    >
      <Text className={classes.text}>{t("auth:setPassword.body")}</Text>
      <Button
        fullWidth
        variant="default"
        className={classes.action}
        onClick={() => void signOut()}
      >
        {t("auth:setPassword.backToSignIn")}
      </Button>
    </AuthLayout>
  );
}
