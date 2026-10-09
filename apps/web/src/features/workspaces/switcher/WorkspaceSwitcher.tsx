import { Menu, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { Link, useNavigate } from "react-router";
import { WORKSPACE_ROLE_LABELS, type WorkspaceResponse } from "@repo/contracts";
import { useAuth } from "../../auth/useAuth";
import { ROLES_AND_PERMISSIONS_PATH } from "../../admin/roles/rolesOverview";
import {
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  SignOutIcon,
  UserPlusIcon,
} from "../icons";
import { useWorkspaces } from "../useWorkspaces";
import { WorkspaceAvatar } from "../WorkspaceAvatar";
import classes from "./WorkspaceSwitcher.module.css";

interface WorkspaceSwitcherProps {
  currentWorkspace?: WorkspaceResponse;
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

  const isInstanceAdmin =
    authState.status === "authenticated" &&
    authState.session.user.isInstanceAdmin;

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

      <Menu.Dropdown className={classes.dropdown}>
        {userEmail && (
          <Menu.Label className={classes.userEmail}>{userEmail}</Menu.Label>
        )}

        <ScrollArea.Autosize mah={320} className={classes.scrollArea}>
          {workspaces.map((ws) => {
            const isCurrent = ws.slug === activeWs.slug;
            const memberText =
              ws.memberCount === 1 ? "1 member" : `${ws.memberCount} members`;
            const roleText = WORKSPACE_ROLE_LABELS[ws.role];

            const workspaceItem = (
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
                  {isCurrent && <CheckIcon className={classes.checkIcon} />}
                </div>
              </Menu.Item>
            );

            if (isCurrent) {
              return (
                <div key={ws.id} className={classes.activeGroup}>
                  {workspaceItem}
                  <Menu.Item
                    component={Link}
                    role="menuitem"
                    to={`/${ws.slug}/settings`}
                    leftSection={<SettingsIcon width={14} height={14} />}
                    className={classes.settingsChip}
                  >
                    Settings
                  </Menu.Item>
                </div>
              );
            }

            return workspaceItem;
          })}
        </ScrollArea.Autosize>

        <Menu.Divider />

        {isInstanceAdmin && (
          <Menu.Item
            leftSection={<PlusIcon />}
            onClick={() => navigate("/create-workspace")}
          >
            <Text size="sm">Create workspace</Text>
          </Menu.Item>
        )}

        {isInstanceAdmin && (
          <>
            <Menu.Item
              leftSection={<UserPlusIcon />}
              onClick={() => navigate("/create-user")}
            >
              <Text size="sm">Create user</Text>
            </Menu.Item>
            <Menu.Item
              leftSection={<ShieldIcon />}
              onClick={() => navigate(ROLES_AND_PERMISSIONS_PATH)}
            >
              <Text size="sm">Roles & Permissions</Text>
            </Menu.Item>
          </>
        )}

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
