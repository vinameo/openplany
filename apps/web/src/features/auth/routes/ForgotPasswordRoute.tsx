import { Anchor, Text } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AuthLayout } from "../AuthLayout";
import { SIGN_IN_PATH } from "../sessionDestination";
import classes from "./AuthRoutes.module.css";

/** Placeholder until the forgot-password flow ships (api-spec 3.4). */
export function ForgotPasswordRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t("auth:forgotPassword.documentTitle"));

  return (
    <AuthLayout title={t("auth:forgotPassword.title")}>
      <Text className={classes.text}>{t("auth:forgotPassword.body")}</Text>
      <Text className={classes.text} mt="lg">
        <Anchor component={Link} to={SIGN_IN_PATH}>
          {t("auth:forgotPassword.backToSignIn")}
        </Anchor>
      </Text>
    </AuthLayout>
  );
}
