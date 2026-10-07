import type { ReactNode } from "react";
import { Image, Text, Title } from "@mantine/core";
import markUrl from "../../assets/openplany-mark.png";
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
        <div className={classes.card}>
          <Image src={markUrl} alt="OpenPlany" className={classes.mark} />
          <Title order={1} className={classes.title}>
            {title}
          </Title>
          {subtitle !== undefined && (
            <Text className={classes.subtitle}>{subtitle}</Text>
          )}
          <div className={classes.body}>{children}</div>
        </div>
      )}
    </main>
  );
}
