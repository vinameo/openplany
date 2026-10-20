import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, Menu, Text, UnstyledButton } from "@mantine/core";
import type { AuthUser } from "../auth/api/authTypes";
import { useAuth } from "../auth/useAuth";
import { KeyIcon, SignOutIcon, UserIcon } from "./icons";
import { ChangeMyPasswordModal } from "./password/ChangeMyPasswordModal";
import { ProfileModal } from "./ProfileModal";
import { userLabel } from "./userName";
import classes from "./UserMenu.module.css";

export interface UserMenuProps {
  user?: AuthUser;
}

/** Account button and dropdown menu in the head bar (RQ WEB-01). */
export function UserMenu({ user }: UserMenuProps) {
  const { t } = useTranslation();
  const { state: authState, signOut } = useAuth();
  const [profileOpenings, setProfileOpenings] = useState(0);
  const [profileOpened, setProfileOpened] = useState(false);
  const [passwordOpenings, setPasswordOpenings] = useState(0);
  const [passwordOpened, setPasswordOpened] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const activeUser =
    user ??
    (authState.status === "authenticated"
      ? authState.session.user
      : undefined);

  if (!activeUser) return null;

  const name = userLabel(activeUser);

  function openProfile(): void {
    setProfileOpenings((count) => count + 1);
    setProfileOpened(true);
  }

  function openPassword(): void {
    setPasswordOpenings((count) => count + 1);
    setPasswordOpened(true);
  }

  async function handleSignOut(): Promise<void> {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error: unknown) {
      console.error("Sign-out request failed", error);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <Menu
        position="bottom-end"
        shadow="md"
        loop
        width="min(300px, calc(100vw - 32px))"
      >
        <Menu.Target>
          <UnstyledButton
            className={classes.button}
            aria-label={t("profile:userMenu.ariaLabel", { name })}
          >
            <Avatar
              src={activeUser.avatarUrl}
              alt=""
              radius="xl"
              size="sm"
              className={classes.avatar}
            >
              {name.charAt(0).toUpperCase()}
            </Avatar>
            <Text
              size="sm"
              fw={500}
              className={classes.name}
              visibleFrom="sm"
            >
              {name}
            </Text>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          <div className={classes.header}>
            <Text size="sm" className={classes.headerName}>
              {name}
            </Text>
            <Text size="xs" className={classes.headerEmail}>
              {activeUser.email}
            </Text>
          </div>

          <Menu.Item
            leftSection={<UserIcon />}
            onClick={openProfile}
          >
            {t("profile:userMenu.editProfile")}
          </Menu.Item>
          <Menu.Item
            leftSection={<KeyIcon />}
            onClick={openPassword}
          >
            {t("profile:userMenu.changePassword")}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            color="red"
            leftSection={<SignOutIcon />}
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
          >
            {t("common:actions.signOut")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {profileOpenings > 0 && (
        <ProfileModal
          key={profileOpenings}
          opened={profileOpened}
          onClose={() => setProfileOpened(false)}
          user={activeUser}
        />
      )}

      {passwordOpenings > 0 && (
        <ChangeMyPasswordModal
          key={passwordOpenings}
          opened={passwordOpened}
          onClose={() => setPasswordOpened(false)}
          user={activeUser}
        />
      )}
    </>
  );
}
