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
import { CommandSearchPlaceholder } from "./CommandSearchPlaceholder";
import { useIsDesktop } from "./useIsDesktop";
import classes from "./AppHeader.module.css";

interface AppHeaderProps {
  currentWorkspace?: WorkspaceResponse;
  variant?: "workspace" | "default";
}

/** Head bar of every signed-in page. */
export function AppHeader({
  currentWorkspace,
  variant = "default",
}: AppHeaderProps) {
  const { state: authState, signOut } = useAuth();
  const { state: wsState } = useWorkspaces();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isDesktop = useIsDesktop();

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

  const isInstanceAdmin =
    authState.status === "authenticated" &&
    authState.session.user.isInstanceAdmin;

  return (
    <header className={classes.header} data-variant={variant}>
      <Container fluid className={classes.inner}>
        <div className={classes.leftGroup}>
          {currentWorkspace ? (
            <WorkspaceSwitcher currentWorkspace={currentWorkspace} />
          ) : (
            <Group gap="xs" wrap="nowrap">
              <Image src={markUrl} alt="OpenPlany" className={classes.mark} />
              {hasNoWorkspaces && isInstanceAdmin && <CreateWorkspaceButton />}
            </Group>
          )}
        </div>

        {isDesktop && (
          <div className={classes.centerGroup}>
            {currentWorkspace && <CommandSearchPlaceholder />}
          </div>
        )}

        <Group gap="xs" wrap="nowrap" className={classes.rightGroup}>
          {!isDesktop && currentWorkspace && <CommandSearchPlaceholder />}
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
