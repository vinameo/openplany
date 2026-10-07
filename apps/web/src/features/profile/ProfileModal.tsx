import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { AuthUser } from "../auth/api/authTypes";
import { ProfileForm } from "./ProfileForm";
import { fullName } from "./profileValidation";
import { userLabel } from "./userName";
import { useProfileForm } from "./useProfileForm";
import classes from "./ProfileModal.module.css";

interface ProfileModalProps {
  opened: boolean;
  onClose: () => void;
  user: AuthUser;
}

/**
 * Edit-your-profile popup. Mount it with a fresh `key` per opening so the
 * form always starts from the current user and discarded typing is gone.
 */
export function ProfileModal({ opened, onClose, user }: ProfileModalProps) {
  const isNarrow = useMediaQuery("(max-width: 575px)");
  const state = useProfileForm({ user, onSaved: onClose });
  const { form, hasChanges, isSaving } = state;
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isConfirmingDiscard) keepEditingRef.current?.focus();
  }, [isConfirmingDiscard]);

  function requestClose(): void {
    if (isSaving) return;
    if (isConfirmingDiscard) {
      setIsConfirmingDiscard(false);
    } else if (hasChanges) {
      setIsConfirmingDiscard(true);
    } else {
      onClose();
    }
  }

  // Follows the typing, so a doubled name like "Kai Tran Tran" shows at once.
  const heading = fullName(form.values) ?? userLabel(user);

  const footer = isConfirmingDiscard ? (
    <Group justify="space-between" className={classes.footer}>
      <Text fw={500} role="alert">
        Discard unsaved changes?
      </Text>
      <Group gap="sm">
        <Button
          ref={keepEditingRef}
          variant="default"
          onClick={() => setIsConfirmingDiscard(false)}
        >
          Keep editing
        </Button>
        <Button color="red" onClick={onClose}>
          Discard
        </Button>
      </Group>
    </Group>
  ) : (
    <div className={classes.footer}>
      <Button
        type="submit"
        disabled={!hasChanges}
        loading={isSaving}
        fullWidth={isNarrow}
      >
        Save changes
      </Button>
    </div>
  );

  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title="Profile"
      size={840}
      radius="lg"
      padding="xl"
      centered
      fullScreen={isNarrow}
      closeOnEscape={!isSaving}
      closeOnClickOutside={!isSaving}
      closeButtonProps={{ disabled: isSaving, "aria-label": "Close profile" }}
      transitionProps={{ transition: isNarrow ? "slide-up" : "fade" }}
      classNames={{ title: classes.title }}
    >
      <Stack gap="xl">
        <Group gap="md" wrap="nowrap">
          <Avatar
            src={user.avatarUrl}
            alt=""
            size={64}
            radius="md"
            className={classes.avatar}
          />
          <div className={classes.identity}>
            <Text className={classes.name}>{heading}</Text>
            <Text className={classes.email}>{user.email}</Text>
          </div>
        </Group>
        <ProfileForm state={state} email={user.email} footer={footer} />
      </Stack>
    </Modal>
  );
}
