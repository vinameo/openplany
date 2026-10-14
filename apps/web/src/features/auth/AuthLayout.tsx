import type { ReactNode } from "react";
import { Image, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ColorSchemeToggle } from "@repo/ui";
import { LanguageMenu } from "../../i18n/LanguageMenu";
import logoUrl from "../../assets/openplany-logo-transparent.png";
import logoDarkUrl from "../../assets/openplany-logo-transparent-dark.png";
import classes from "./AuthLayout.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** false renders only the page background, e.g. while the session loads. */
  showCard?: boolean;
}

/** Shared frame of the sign-in, set-password and forgot/reset-password screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
  showCard = true,
}: AuthLayoutProps) {
  const { t } = useTranslation();

  return (
    <main className={classes.page}>
      {showCard && (
        <>
          <div className={classes.headerControls}>
            <LanguageMenu />
            <ColorSchemeToggle
              labelLight={t("common:theme.switchToLight")}
              labelDark={t("common:theme.switchToDark")}
            />
          </div>
          <div className={classes.card}>
            {/* Same canvas in both files, so one crop fits; the dark one has a light wordmark. */}
            <div className={classes.logo}>
              <Image
                src={logoUrl}
                alt="OpenPlany"
                className={classes.logoImage}
                darkHidden
              />
              <Image
                src={logoDarkUrl}
                alt="OpenPlany"
                className={classes.logoImage}
                lightHidden
              />
            </div>
            <Title order={1} className={classes.title}>
              {title}
            </Title>
            {subtitle !== undefined && (
              <Text className={classes.subtitle}>{subtitle}</Text>
            )}
            <div className={classes.body}>{children}</div>
          </div>
        </>
      )}
    </main>
  );
}
