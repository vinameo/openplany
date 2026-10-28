import type { ComponentType, ReactNode, SVGProps } from "react";
import { Alert, Button, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import classes from "./SettingsSectionFrame.module.css";

export interface SettingsSectionFrameProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  allowed: boolean;
  children: ReactNode;
  status?: "ready" | "loading" | "error";
  errorMessage?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export function SettingsSectionFrame({
  icon: Icon,
  label,
  allowed,
  children,
  status = "ready",
  errorMessage,
  retryLabel,
  onRetry,
}: SettingsSectionFrameProps) {
  const { t } = useTranslation();

  let body: ReactNode;
  if (!allowed) {
    body = (
      <Alert
        color="red"
        title={t("settings:section.accessDenied")}
        role="alert"
      >
        {t("settings:section.noAccess")}
      </Alert>
    );
  } else if (status === "loading") {
    body = (
      <div
        className={classes.loadingContainer}
        role="status"
        aria-label={t("common:loading", "Loading…")}
      >
        <Loader size="sm" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <Alert color="red" role="alert" className={classes.errorAlert}>
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{errorMessage ?? t("errors:genericError")}</Text>
          {onRetry && (
            <Button variant="default" size="xs" onClick={onRetry}>
              {retryLabel ?? t("common:actions.tryAgain", "Try again")}
            </Button>
          )}
        </Stack>
      </Alert>
    );
  } else {
    body = children;
  }

  return (
    <>
      <div className={classes.sectionHeader}>
        <Icon width={16} height={16} />
        <Text className={classes.sectionTitle}>{label}</Text>
      </div>
      <div className={classes.sectionBody}>{body}</div>
    </>
  );
}
