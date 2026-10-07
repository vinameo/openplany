import { useState } from "react";
import { Button, Container, Group, Image } from "@mantine/core";
import markUrl from "../../assets/openplany-mark.png";
import { useAuth } from "../auth/useAuth";
import { UserButton } from "../profile/UserButton";
import classes from "./AppHeader.module.css";

/** Head bar of every signed-in page. */
export function AppHeader() {
  const { state, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (state.status !== "authenticated") return null;

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
    <header className={classes.header}>
      <Container size="lg" className={classes.inner}>
        <Image src={markUrl} alt="OpenPlany" className={classes.mark} />
        <Group gap="sm">
          <UserButton user={state.session.user} />
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
  );
}
