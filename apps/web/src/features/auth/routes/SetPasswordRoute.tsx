import { useRef } from "react";
import { Button, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AuthLayout } from "../AuthLayout";
import { HOME_PATH, SIGN_IN_PATH } from "../sessionDestination";
import { useAuth } from "../useAuth";
import { ChangeMyPasswordForm } from "../../profile/password/ChangeMyPasswordForm";
import { useChangeMyPasswordForm } from "../../profile/password/useChangeMyPasswordForm";
import classes from "./AuthRoutes.module.css";

/**
 * Landing screen for rule 9 (password expired / reset required).
 * Requires the user to enter current password and pick a new password (WEB B2.7).
 */
export function SetPasswordRoute() {
  const { t } = useTranslation();
  const { state, signOut } = useAuth();
  useDocumentTitle(t("auth:setPassword.documentTitle"));
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);

  const email =
    state.status === "authenticated" ? state.session.user.email : "";

  const formState = useChangeMyPasswordForm({
    email,
    onSuccess: () => {},
    onUnauthenticated: () => {
      notifications.show({
        message: t("auth:setPassword.expired"),
      });
    },
    focusCurrentPassword: () => {
      currentPasswordInputRef.current?.focus();
    },
  });

  if (state.status === "loading") {
    return <AuthLayout title={t("auth:setPassword.title")} showCard={false} />;
  }
  if (state.status === "anonymous") {
    return <Navigate to={SIGN_IN_PATH} replace />;
  }
  if (!state.session.requiresPasswordReset) {
    return <Navigate to={HOME_PATH} replace />;
  }

  const footer = (
    <div className={classes.actions}>
      <Button
        type="submit"
        variant="filled"
        fullWidth
        className={classes.action}
        loading={formState.isSubmitting}
      >
        {t("auth:setPassword.submit")}
      </Button>
      <Button
        type="button"
        variant="default"
        fullWidth
        className={classes.action}
        disabled={formState.isSubmitting}
        onClick={() => void signOut()}
      >
        {t("auth:setPassword.backToSignIn")}
      </Button>
    </div>
  );

  return (
    <AuthLayout
      title={t("auth:setPassword.title")}
      subtitle={t("auth:setPassword.subtitle")}
    >
      <Text className={classes.text} mb="md">
        {t("auth:setPassword.body")}
      </Text>
      <ChangeMyPasswordForm
        state={formState}
        email={state.session.user.email}
        footer={footer}
        currentPasswordInputRef={currentPasswordInputRef}
      />
    </AuthLayout>
  );
}
