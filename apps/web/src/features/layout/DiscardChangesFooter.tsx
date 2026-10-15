import type { Ref } from "react";
import { Button, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export interface DiscardChangesFooterProps {
  title?: string;
  keepEditingLabel?: string;
  discardLabel?: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
  keepEditingRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export function DiscardChangesFooter({
  title,
  keepEditingLabel,
  discardLabel,
  onKeepEditing,
  onDiscard,
  keepEditingRef,
  className,
}: DiscardChangesFooterProps) {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" className={className}>
      <Text fw={500} role="alert">
        {title ?? t("workspace:discard.title")}
      </Text>
      <Group gap="sm">
        <Button ref={keepEditingRef} variant="default" onClick={onKeepEditing}>
          {keepEditingLabel ?? t("workspace:discard.keepEditing")}
        </Button>
        <Button color="red" onClick={onDiscard}>
          {discardLabel ?? t("workspace:discard.discard")}
        </Button>
      </Group>
    </Group>
  );
}
