import type { ReactNode } from "react";
import { Image, Text, Title } from "@mantine/core";
import { ColorSchemeToggle } from "@repo/ui";
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
  return (
    <main className={classes.page}>
      {showCard && (
        <>
          <ColorSchemeToggle className={classes.schemeToggle} />
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
