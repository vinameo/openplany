import { Alert, Container, Title } from "@mantine/core";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useAuth } from "../auth/useAuth";
import { useCurrentWorkspace } from "../workspaces/currentWorkspace/useCurrentWorkspace";
import classes from "./HomePage.module.css";

/** Landing page after sign-in; displays current workspace title. */
export function HomePage() {
  const { state } = useAuth();
  const { workspace } = useCurrentWorkspace();

  const title = `${workspace.name} · OpenPlany`;
  useDocumentTitle(title);

  if (state.status !== "authenticated") return null;
  const { user } = state.session;

  return (
    <Container size="lg" className={classes.main}>
      {!user.isEmailVerified && (
        <Alert color="yellow" mb="lg" title="Verify your email">
          Check your inbox for a verification link from OpenPlany.
        </Alert>
      )}
      <Title order={1} size="h3">
        {workspace.name}
      </Title>
    </Container>
  );
}
