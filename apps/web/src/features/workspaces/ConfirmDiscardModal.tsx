import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export interface ConfirmDiscardModalProps {
  opened: boolean;
  onClose: () => void;
  onDiscard: () => void;
}

export function ConfirmDiscardModal({
  opened,
  onClose,
  onDiscard,
}: ConfirmDiscardModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("workspace:discard.title")}
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm">{t("workspace:discard.message")}</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            {t("workspace:discard.keepEditing")}
          </Button>
          <Button color="red" onClick={onDiscard}>
            {t("workspace:discard.discard")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
