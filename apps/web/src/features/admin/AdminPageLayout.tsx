import type { ReactNode } from "react";
import { Button, Text, Title } from "@mantine/core";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ColorSchemeToggle } from "@repo/ui";
import { ArrowLeftIcon } from "../workspaces/icons";
import classes from "./AdminPageLayout.module.css";

export interface AdminPageLayoutProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  backLabel?: ReactNode;
  onBack?: () => void;
  maxWidth?: number | string;
  children: ReactNode;
}

export function AdminPageLayout({
  title,
  subtitle,
  badge,
  backLabel,
  onBack,
  maxWidth,
  children,
}: AdminPageLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleGoBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  const resolvedBackLabel = backLabel ?? t("admin:roles.back");
  const ariaBackLabel =
    typeof resolvedBackLabel === "string" ? resolvedBackLabel : undefined;

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <ColorSchemeToggle
          size="input-xs"
          labelLight={t("common:theme.switchToLight")}
          labelDark={t("common:theme.switchToDark")}
        />
      </div>

      <main
        className={classes.main}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title && (
          <div className={classes.header}>
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<ArrowLeftIcon width={16} height={16} />}
              onClick={handleGoBack}
              aria-label={ariaBackLabel}
              className={classes.backButton}
            >
              {resolvedBackLabel}
            </Button>
            <div className={classes.titleRow}>
              <Title order={1} className={classes.title}>
                {title}
              </Title>
              {badge}
            </div>
            {subtitle && <Text className={classes.subtitle}>{subtitle}</Text>}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
