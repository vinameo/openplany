import { useState } from "react";
import { Avatar, Text, UnstyledButton } from "@mantine/core";
import type { AuthUser } from "../auth/api/authTypes";
import { ProfileModal } from "./ProfileModal";
import { userLabel } from "./userName";
import classes from "./UserButton.module.css";

interface UserButtonProps {
  user: AuthUser;
}

/** Avatar and name in the head bar; opens the profile popup. */
export function UserButton({ user }: UserButtonProps) {
  const [openings, setOpenings] = useState(0);
  const [opened, setOpened] = useState(false);
  const name = userLabel(user);

  function open(): void {
    setOpenings((count) => count + 1);
    setOpened(true);
  }

  return (
    <>
      <UnstyledButton
        className={classes.button}
        onClick={open}
        aria-haspopup="dialog"
        aria-label={`Edit profile – ${name}`}
      >
        <Avatar src={user.avatarUrl} alt="" radius="xl" size="sm">
          {name.charAt(0).toUpperCase()}
        </Avatar>
        <Text size="sm" fw={500} className={classes.name}>
          {name}
        </Text>
      </UnstyledButton>
      {openings > 0 && (
        <ProfileModal
          key={openings}
          opened={opened}
          onClose={() => setOpened(false)}
          user={user}
        />
      )}
    </>
  );
}
