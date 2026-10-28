import { useEffect, useRef } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MessageKey, StateGroup } from "@repo/contracts";

export interface ChangeStateGroupModalProps {
  opened: boolean;
  stateName: string;
  targetGroup: StateGroup;
  count: number;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChangeStateGroupModal({
  opened,
  stateName,
  targetGroup,
  count,
  isPending = false,
  onConfirm,
  onCancel,
}: ChangeStateGroupModalProps) {
  const { t } = useTranslation();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (opened) {
      requestAnimationFrame(() => {
        cancelBtnRef.current?.focus();
      });
    }
  }, [opened]);

  const groupLabel = t(("state:groups." + targetGroup) as MessageKey);

  return (
    <Modal
      opened={opened}
      onClose={isPending ? () => {} : onCancel}
      title={t("state:changeGroup.title", { name: stateName })}
      centered
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
    >
      <Stack gap="md">
        <Text size="sm">
          {t("state:changeGroup.body", { count, group: groupLabel })}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button
            ref={cancelBtnRef}
            variant="default"
            disabled={isPending}
            onClick={onCancel}
          >
            {t("state:form.cancel")}
          </Button>
          <Button
            color="blue"
            loading={isPending}
            disabled={isPending}
            onClick={onConfirm}
          >
            {t("state:changeGroup.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
