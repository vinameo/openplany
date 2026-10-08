import { Box, Text, Title } from "@mantine/core";

export function SettingsSectionNotFound() {
  return (
    <Box p={24}>
      <Title order={2} size="h3" mb="xs">
        Settings page not found
      </Title>
      <Text c="dimmed">
        This settings section doesn't exist or you don't have access to it.
      </Text>
    </Box>
  );
}

