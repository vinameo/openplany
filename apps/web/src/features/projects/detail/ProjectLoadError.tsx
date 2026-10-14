import { Alert, Button, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function ProjectLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <Alert color="red" title={t("common:error")} radius="md">
      {t("project:detail.loadError")}
      <Group mt="md">
        <Button variant="default" size="xs" onClick={onRetry}>
          {t("common:actions.retry")}
        </Button>
      </Group>
    </Alert>
  );
}
