import { Alert, Container, Title } from "@mantine/core";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useAuth } from "../auth/useAuth";
import { userLabel } from "../profile/userName";
import classes from "./HomePage.module.css";

/** Landing page after sign-in; the real dashboard replaces its body later. */
export function HomePage() {
  const { state } = useAuth();
  useDocumentTitle("OpenPlany");

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
        Welcome, {userLabel(user)}
      </Title>
    </Container>
  );
}
