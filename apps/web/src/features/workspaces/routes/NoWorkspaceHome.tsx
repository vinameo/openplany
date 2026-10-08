import { Alert, Button, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useAuth } from "../../auth/useAuth";
import { AppHeader } from "../../layout/AppHeader";
import classes from "./NoWorkspaceHome.module.css";

export function NoWorkspaceHome() {
  const { state } = useAuth();
  useDocumentTitle("OpenPlany");

  const user = state.status === "authenticated" ? state.session.user : null;

  return (
    <div className={classes.wrapper}>
      <AppHeader />
      <main className={classes.content}>
        {user && !user.isEmailVerified && (
          <Alert color="yellow" mb="lg" title="Verify your email" w="100%">
            Check your inbox for a verification link from OpenPlany.
          </Alert>
        )}
        <Title order={1} className={classes.title}>
          You're not in a workspace yet
        </Title>
        <p className={classes.description}>
          Create one to start planning, or ask your admin to invite you.
        </p>
        <Button
          component={Link}
          to="/create-workspace"
          size="md"
          variant="filled"
        >
          Create workspace
        </Button>
      </main>
    </div>
  );
}
