import { Button, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import classes from "./NoWorkspaceHome.module.css";

export function NoWorkspaceHome() {
  useDocumentTitle("OpenPlany");
  const { state: authState } = useAuth();
  const isInstanceAdmin =
    authState.status === "authenticated" &&
    authState.session.user.isInstanceAdmin;

  return (
    <div className={classes.wrapper}>
      <AppHeader />
      <main className={classes.content}>
        <Title order={1} className={classes.title}>
          You're not in a workspace yet
        </Title>
        <p className={classes.description}>
          {isInstanceAdmin
            ? "Create one to start planning, or ask your admin to invite you."
            : "Ask your admin to invite you to a workspace to get started."}
        </p>
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
      </main>
    </div>
  );
}
