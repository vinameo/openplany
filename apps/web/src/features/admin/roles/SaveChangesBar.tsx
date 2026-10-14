import { Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import classes from "./SaveChangesBar.module.css";

interface SaveChangesBarProps {
  changeCount: number;
  onDiscard: () => void;
  onSaveClick: () => void;
  disabled?: boolean;
}

export function SaveChangesBar({
  changeCount,
  onDiscard,
  onSaveClick,
  disabled = false,
}: SaveChangesBarProps) {
  const { t } = useTranslation();

  if (changeCount <= 0) return null;

  const countText = t("admin:roles.unsavedChanges.count", {
    count: changeCount,
  });

  return (
    <div
      className={classes.bar}
      role="region"
      aria-label={t("admin:roles.unsavedChanges.regionLabel")}
    >
      <Text className={classes.text}>{countText}</Text>
      <div className={classes.actions}>
        <Button
          variant="subtle"
          color="gray"
          onClick={onDiscard}
          disabled={disabled}
        >
          {t("common:actions.discard")}
        </Button>
        <Button variant="filled" onClick={onSaveClick} disabled={disabled}>
          {t("common:actions.saveChanges")}
        </Button>
      </div>
    </div>
  );
}
