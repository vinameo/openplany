import { Box, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function SettingsSectionNotFound() {
  const { t } = useTranslation();

  return (
    <Box p={24}>
      <Title order={2} size="h3" mb="xs">
        {t("workspace:settings.notFound.title")}
      </Title>
      <Text c="dimmed">
        {t("workspace:settings.notFound.description")}
      </Text>
    </Box>
  );
}


