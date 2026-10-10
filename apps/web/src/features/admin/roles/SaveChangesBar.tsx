import { Button, Text } from "@mantine/core";
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
  if (changeCount <= 0) return null;

  const countText =
    changeCount === 1 ? "1 unsaved change" : `${changeCount} unsaved changes`;

  return (
    <div className={classes.bar} role="region" aria-label="Unsaved changes bar">
      <Text className={classes.text}>{countText}</Text>
      <div className={classes.actions}>
        <Button
          variant="subtle"
          color="gray"
          onClick={onDiscard}
          disabled={disabled}
        >
          Discard
        </Button>
        <Button
          variant="filled"
          onClick={onSaveClick}
          disabled={disabled}
        >
          Save changes
        </Button>
      </div>
    </div>
  );
}

