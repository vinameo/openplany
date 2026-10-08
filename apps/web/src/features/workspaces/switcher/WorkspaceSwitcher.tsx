import { Menu, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { useNavigate } from "react-router";
import type { WorkspaceResponse } from "@repo/contracts";
import { useAuth } from "../../auth/useAuth";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SignOutIcon,
} from "../icons";
import { useWorkspaces } from "../useWorkspaces";
import { WorkspaceAvatar } from "../WorkspaceAvatar";
import classes from "./WorkspaceSwitcher.module.css";

interface WorkspaceSwitcherProps {
  currentWorkspace?: WorkspaceResponse;
}

function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function WorkspaceSwitcher({
  currentWorkspace,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const { state: authState, signOut } = useAuth();
  const { state: wsState } = useWorkspaces();

  const userEmail =
    authState.status === "authenticated"
      ? authState.session.user.email
      : "";

  const workspaces =
    wsState.status === "ready" ? wsState.workspaces : [];

  const activeWs =
    currentWorkspace ??
    (wsState.status === "ready" ? workspaces[0] : undefined);

  if (!activeWs) return null;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err: unknown) {
      console.error("Sign-out error", err);
    }
  }

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  return (
    <Menu
      width="min(300px, calc(100vw - 32px))"
      position="bottom-start"
      shadow="md"
      loop
    >
      <Menu.Target>
        <UnstyledButton
          className={classes.trigger}
          aria-label={`Switch workspace – ${activeWs.name}`}
        >
          <WorkspaceAvatar
            name={activeWs.name}
            backgroundColor={activeWs.backgroundColor}
            size={28}
          />
          <span className={classes.name}>{activeWs.name}</span>
          <ChevronDownIcon className={classes.chevron} />
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        {userEmail && (
          <Menu.Label className={classes.userEmail}>{userEmail}</Menu.Label>
        )}

        <ScrollArea.Autosize mah={320}>
          {workspaces.map((ws) => {
            const isCurrent = ws.slug === activeWs.slug;
            const memberText =
              ws.memberCount === 1 ? "1 member" : `${ws.memberCount} members`;
            const roleText = capitalize(ws.role);

            return (
              <Menu.Item
                key={ws.id}
                className={`${classes.menuItem} ${isCurrent ? classes.activeItem : ""}`}
                aria-current={isCurrent ? "true" : undefined}
                title={`${origin}/${ws.slug}`}
                onClick={() => {
                  if (!isCurrent) {
                    navigate(`/${ws.slug}`);
                  }
                }}
              >
                <div className={classes.itemContent}>
                  <div className={classes.itemLeft}>
                    <WorkspaceAvatar
                      name={ws.name}
                      backgroundColor={ws.backgroundColor}
                      size={24}
                    />
                    <div className={classes.itemDetails}>
                      <span className={classes.itemName}>{ws.name}</span>
                      <span className={classes.itemMeta}>
                        {roleText} · {memberText}
                      </span>
                    </div>
                  </div>
                  {isCurrent && <CheckIcon />}
                </div>
              </Menu.Item>
            );
          })}
        </ScrollArea.Autosize>

        <Menu.Divider />

        <Menu.Item
          leftSection={<PlusIcon />}
          onClick={() => navigate("/create-workspace")}
        >
          <Text size="sm">Create workspace</Text>
        </Menu.Item>

        <Menu.Item
          color="red"
          leftSection={<SignOutIcon />}
          onClick={() => void handleSignOut()}
        >
          <Text size="sm">Sign out</Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

