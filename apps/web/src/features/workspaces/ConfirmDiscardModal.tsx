import { Button, Group, Modal, Stack, Text } from "@mantine/core";

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
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Discard changes?"
      centered
      size="sm"
    >
      <Stack gap="md">
        <Text size="sm">
          You have unsaved changes. Are you sure you want to discard them?
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Keep editing
          </Button>
          <Button color="red" onClick={onDiscard}>
            Discard
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
