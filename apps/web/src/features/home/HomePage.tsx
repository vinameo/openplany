import { useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Container,
  Group,
  Image,
  Text,
  Title,
} from "@mantine/core";
import markUrl from "../../assets/openplany-mark.png";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useAuth } from "../auth/useAuth";
import classes from "./HomePage.module.css";

/** Landing page after sign-in; the real dashboard replaces its body later. */
export function HomePage() {
  const { state, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  useDocumentTitle("OpenPlany");

  if (state.status !== "authenticated") return null;
  const { user } = state.session;
  const name = user.displayName !== "" ? user.displayName : user.email;

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error: unknown) {
      // Signed out locally either way; the server session expires on its own.
      console.error("Sign-out request failed", error);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <header className={classes.header}>
        <Container size="lg" className={classes.headerInner}>
          <Image src={markUrl} alt="OpenPlany" className={classes.mark} />
          <Group gap="sm">
            <Avatar src={user.avatarUrl} alt="" radius="xl" size="sm">
              {name.charAt(0).toUpperCase()}
            </Avatar>
            <Text size="sm" fw={500}>
              {name}
            </Text>
            <Button
              variant="default"
              size="xs"
              loading={isSigningOut}
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </Group>
        </Container>
      </header>
      <Container size="lg" className={classes.main}>
        {!user.isEmailVerified && (
          <Alert color="yellow" mb="lg" title="Verify your email">
            Check your inbox for a verification link from OpenPlany.
          </Alert>
        )}
        <Title order={1} size="h3">
          Welcome, {name}
        </Title>
      </Container>
    </>
  );
}
