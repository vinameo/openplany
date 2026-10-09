import { Button, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AppHeader } from "../../layout/AppHeader";
import classes from "./NoWorkspaceHome.module.css";

export function NoWorkspaceHome() {
  useDocumentTitle("OpenPlany");

  return (
    <div className={classes.wrapper}>
      <AppHeader />
      <main className={classes.content}>
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
