import { Box, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ProjectSettingsTitle } from "./ProjectSettingsTitle";

export function ProjectSettingsSectionNotFound() {
  const { t } = useTranslation();

  return (
    <>
      <ProjectSettingsTitle />
      <Box p={24}>
        <Title order={2} size="h3" mb="xs">
          {t("project:settings.notFound.title")}
        </Title>
        <Text c="dimmed">{t("project:settings.notFound.description")}</Text>
      </Box>
    </>
  );
}
