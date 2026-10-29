import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";

export function WorkspaceNotFound() {
  const { t } = useTranslation();
  useDocumentTitle(t("workspace:notFound.documentTitle"));

  return (
    <Container size="sm" py={96}>
      <Stack align="center" gap="md" ta="center">
        <Title order={1} size="h2">
          {t("workspace:notFound.title")}
        </Title>
        <Text c="dimmed" size="lg">
          {t("workspace:notFound.description")}
        </Text>
        <Button component={Link} to="/" variant="filled">
          {t("workspace:notFound.goToWorkspaces")}
        </Button>
      </Stack>
    </Container>
  );
}
