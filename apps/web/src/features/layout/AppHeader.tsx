import { useState } from "react";
import { Button, Container, Group, Image } from "@mantine/core";
import type { WorkspaceResponse } from "@repo/contracts";
import { ColorSchemeToggle } from "@repo/ui";
import markUrl from "../../assets/openplany-mark.png";
import { useAuth } from "../auth/useAuth";
import { UserButton } from "../profile/UserButton";
import { CreateWorkspaceButton } from "../workspaces/CreateWorkspaceButton";
import { WorkspaceSwitcher } from "../workspaces/switcher/WorkspaceSwitcher";
import { useWorkspaces } from "../workspaces/useWorkspaces";
import classes from "./AppHeader.module.css";

interface AppHeaderProps {
  currentWorkspace?: WorkspaceResponse;
}

/** Head bar of every signed-in page. */
export function AppHeader({ currentWorkspace }: AppHeaderProps) {
  const { state: authState, signOut } = useAuth();
  const { state: wsState } = useWorkspaces();
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (authState.status !== "authenticated") return null;

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error: unknown) {
      console.error("Sign-out request failed", error);
    } finally {
      setIsSigningOut(false);
    }
  }

  const hasNoWorkspaces =
    wsState.status === "ready" && wsState.workspaces.length === 0;

  return (
    <header className={classes.header}>
      <Container size="lg" className={classes.inner}>
        <div className={classes.leftGroup}>
          {currentWorkspace ? (
            <WorkspaceSwitcher currentWorkspace={currentWorkspace} />
          ) : (
            <Group gap="xs" wrap="nowrap">
              <Image src={markUrl} alt="OpenPlany" className={classes.mark} />
              {hasNoWorkspaces && <CreateWorkspaceButton />}
            </Group>
          )}
        </div>

        <Group gap="xs" wrap="nowrap" className={classes.rightGroup}>
          <ColorSchemeToggle size="input-xs" />
          <UserButton user={authState.session.user} />
          {!currentWorkspace && (
            <Button
              variant="default"
              size="xs"
              loading={isSigningOut}
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          )}
        </Group>
      </Container>
    </header>
  );
}
