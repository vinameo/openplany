import type { ReactNode } from "react";
import { Alert, Button, Group, Modal, Stack } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import classes from "./RoleChangeConfirmModal.module.css";

export interface RoleChangeConfirmModalProps {
  opened: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger: boolean;
  pending: boolean;
  confirmDisabled?: boolean;
  error: string | null;
  onConfirm(): void;
  onCancel(): void;
}

export function RoleChangeConfirmModal({
  opened,
  title,
  children,
  confirmLabel,
  danger,
  pending,
  confirmDisabled,
  error,
  onConfirm,
  onCancel,
}: RoleChangeConfirmModalProps) {
  const { t } = useTranslation();
  const isMobile = useMediaQuery("(max-width: 48em)");

  return (
    <Modal
      opened={opened}
      onClose={pending ? () => {} : onCancel}
      title={title}
      fullScreen={isMobile}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
      trapFocus
    >
      <Stack gap="md" className={classes.body}>
        {children}

        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="sm" className={classes.actions}>
          <Button
            variant="default"
            onClick={onCancel}
            disabled={pending}
            data-autofocus
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            color={danger ? "red" : undefined}
            loading={pending}
            disabled={confirmDisabled || pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
