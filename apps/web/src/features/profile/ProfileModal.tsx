import { useTranslation } from "react-i18next";
import { Avatar, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { AuthUser } from "../auth/api/authTypes";
import { DiscardChangesFooter } from "../layout/DiscardChangesFooter";
import { useDiscardGuard } from "../layout/useDiscardGuard";
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
  const { t } = useTranslation();
  const isNarrow = useMediaQuery("(max-width: 575px)");
  const state = useProfileForm({ user, onSaved: onClose });
  const { form, hasChanges, isSaving } = state;
  const { isConfirmingDiscard, keepEditingRef, requestClose, cancelDiscard } =
    useDiscardGuard({
      hasChanges,
      isSaving,
      onDiscard: onClose,
    });

  // Follows the typing, so a doubled name like "Kai Tran Tran" shows at once.
  const heading = fullName(form.values) ?? userLabel(user);

  const footer = isConfirmingDiscard ? (
    <DiscardChangesFooter
      title={t("profile:discardModal.title")}
      keepEditingRef={keepEditingRef}
      onKeepEditing={cancelDiscard}
      onDiscard={onClose}
      className={classes.footer}
    />
  ) : (
    <div className={classes.footer}>
      <Button
        type="submit"
        disabled={!hasChanges}
        loading={isSaving}
        fullWidth={isNarrow}
      >
        {t("common:actions.saveChanges")}
      </Button>
    </div>
  );

  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title={t("profile:title")}
      size={840}
      radius="lg"
      padding="xl"
      fullScreen={isNarrow}
      closeOnEscape={!isSaving}
      closeOnClickOutside={!isSaving}
      closeButtonProps={{
        disabled: isSaving,
        "aria-label": t("profile:modal.closeProfile"),
      }}
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
