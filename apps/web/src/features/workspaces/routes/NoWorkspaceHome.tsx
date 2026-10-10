import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Group, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import { useWorkspaces } from "../useWorkspaces";
import classes from "./NoWorkspaceHome.module.css";

export function NoWorkspaceHome() {
  useDocumentTitle("OpenPlany");
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
    try {
      await refresh();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      isCheckingRef.current = false;
    }
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
          You're not in a workspace yet
        </Title>
        <p className={classes.description}>
          {isInstanceAdmin
            ? "Create one to start planning, or ask a workspace Admin to add you."
            : "Ask a workspace Admin to add you to a workspace to get started."}
        </p>
        <Group gap="sm">
          {isInstanceAdmin && (
            <Button
              component={Link}
              to="/create-workspace"
              size="md"
              variant="filled"
            >
              Create workspace
            </Button>
          )}
          <Button
            size="md"
            variant="default"
            loading={loading}
            onClick={() => void checkWorkspaces()}
          >
            Check again
          </Button>
        </Group>
        {error && (
          <Text c="red" size="sm" mt="xs">
            Couldn't check. Try again.
          </Text>
        )}
      </main>
    </div>
  );
}
