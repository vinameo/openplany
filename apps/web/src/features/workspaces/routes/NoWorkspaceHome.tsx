import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Group, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import { useWorkspaces } from "../useWorkspaces";
import classes from "./NoWorkspaceHome.module.css";

export function NoWorkspaceHome() {
  const { t } = useTranslation();
  useDocumentTitle(t("workspace:noWorkspace.documentTitle"));
  const { state: authState } = useAuth();
  const { refresh } = useWorkspaces();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const lastCheckRef = useRef<number>(0);
  const isCheckingRef = useRef<boolean>(false);

  useEffect(() => {
    lastCheckRef.current = Date.now();
  }, []);

  const isInstanceAdmin =
    authState.status === "authenticated" &&
    authState.session.user.isInstanceAdmin;

  const checkWorkspaces = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setLoading(true);
    setError(false);
    lastCheckRef.current = Date.now();
    const loaded = await refresh();
    setError(!loaded);
    setLoading(false);
    isCheckingRef.current = false;
  }, [refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastCheckRef.current >= 10_000 && !isCheckingRef.current) {
          void checkWorkspaces();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkWorkspaces]);

  return (
    <div className={classes.wrapper}>
      <AppHeader />
      <main className={classes.content}>
        <Title order={1} className={classes.title}>
          {t("workspace:noWorkspace.title")}
        </Title>
        <p className={classes.description}>
          {isInstanceAdmin
            ? t("workspace:noWorkspace.adminDesc")
            : t("workspace:noWorkspace.memberDesc")}
        </p>
        <Group gap="sm">
          {isInstanceAdmin && (
            <Button
              component={Link}
              to="/create-workspace"
              size="md"
              variant="filled"
            >
              {t("workspace:noWorkspace.createButton")}
            </Button>
          )}
          <Button
            size="md"
            variant="default"
            loading={loading}
            onClick={() => void checkWorkspaces()}
          >
            {t("workspace:noWorkspace.checkAgain")}
          </Button>
        </Group>
        {error && (
          <Text c="red" size="sm" mt="xs">
            {t("workspace:noWorkspace.checkError")}
          </Text>
        )}
      </main>
    </div>
  );
}
