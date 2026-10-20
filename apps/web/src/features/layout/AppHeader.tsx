import { Container, Group, Image } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { WorkspaceResponse } from "@repo/contracts";
import { ColorSchemeToggle } from "@repo/ui";
import { LanguageMenu } from "../../i18n/LanguageMenu";
import markUrl from "../../assets/openplany-mark.png";
import { useAuth } from "../auth/useAuth";
import { UserMenu } from "../profile/UserMenu";
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
  const { t } = useTranslation();
  const { state: authState } = useAuth();
  const { state: wsState } = useWorkspaces();
  const isDesktop = useIsDesktop();

  if (authState.status !== "authenticated") return null;

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
          <LanguageMenu size="input-xs" />
          <ColorSchemeToggle
            size="input-xs"
            labelLight={t("common:theme.switchToLight")}
            labelDark={t("common:theme.switchToDark")}
          />
          <UserMenu user={authState.session.user} />
        </Group>
      </Container>
    </header>
  );
}
