import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, Stack, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { AuthUser } from "../../auth/api/authTypes";
import { DiscardChangesFooter } from "../../layout/DiscardChangesFooter";
import { useDiscardGuard } from "../../layout/useDiscardGuard";
import { ChangeMyPasswordForm } from "./ChangeMyPasswordForm";
import { useChangeMyPasswordForm } from "./useChangeMyPasswordForm";
import classes from "./ChangeMyPasswordModal.module.css";

export interface ChangeMyPasswordModalProps {
  opened: boolean;
  onClose: () => void;
  user: AuthUser;
}

/**
 * Change-your-own-password popup. Mount it with a fresh `key` per opening so
 * that discarded input is not retained across openings (RQ INV-W1).
 */
export function ChangeMyPasswordModal({
  opened,
  onClose,
  user,
}: ChangeMyPasswordModalProps) {
  const { t } = useTranslation();
  const isNarrow = useMediaQuery("(max-width: 575px)");
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);

  const state = useChangeMyPasswordForm({
    email: user.email,
    onSuccess: onClose,
    focusCurrentPassword: () => {
      currentPasswordInputRef.current?.focus();
    },
  });

  const { isSubmitting, hasChanges } = state;

  const { isConfirmingDiscard, keepEditingRef, requestClose, cancelDiscard } =
    useDiscardGuard({
      hasChanges,
      isSaving: isSubmitting,
      onDiscard: onClose,
    });

  const footer = isConfirmingDiscard ? (
    <DiscardChangesFooter
      title={t("profile:discardModal.title")}
      keepEditingRef={keepEditingRef}
      onKeepEditing={cancelDiscard}
      onDiscard={onClose}
      className={classes.footer}
    />
  ) : (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" className={classes.note}>
        {t("profile:password.note")}
      </Text>
      <div className={classes.actions}>
        <Button
          type="submit"
          variant="filled"
          loading={isSubmitting}
          fullWidth={isNarrow}
        >
          {t("profile:password.submit")}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={requestClose}
          disabled={isSubmitting}
          fullWidth={isNarrow}
        >
          {t("common:actions.cancel")}
        </Button>
      </div>
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title={t("profile:password.title")}
      size={560}
      radius="lg"
      padding="xl"
      fullScreen={isNarrow}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      closeButtonProps={{
        disabled: isSubmitting,
        "aria-label": t("profile:password.close"),
      }}
      transitionProps={{ transition: isNarrow ? "slide-up" : "fade" }}
      classNames={{ title: classes.title }}
    >
      <ChangeMyPasswordForm
        state={state}
        email={user.email}
        footer={footer}
        currentPasswordInputRef={currentPasswordInputRef}
      />
    </Modal>
  );
}
