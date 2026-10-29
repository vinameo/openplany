import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "../../auth/AuthLayout";
import { useWorkspaces } from "../useWorkspaces";
import { NoWorkspaceHome } from "./NoWorkspaceHome";
import { workspacePath } from "../workspacePaths";

export function HomeRedirect() {
  const { t } = useTranslation();
  const { state, refresh } = useWorkspaces();

  if (state.status === "loading") {
    return <AuthLayout title="" showCard={false} />;
  }

  if (state.status === "error") {
    return (
      <Container size="sm" py={80}>
        <Stack align="center" gap="md">
          <Title order={2}>{t("workspace:homeRedirect.loadErrorTitle")}</Title>
          <Text c="dimmed">{t("workspace:homeRedirect.loadErrorDesc")}</Text>
          <Button variant="default" onClick={() => void refresh()}>
            {t("workspace:homeRedirect.tryAgain")}
          </Button>
        </Stack>
      </Container>
    );
  }

  if (state.workspaces.length === 0) {
    return <NoWorkspaceHome />;
  }

  const destinationSlug = state.lastWorkspaceSlug ?? state.workspaces[0]!.slug;

  return <Navigate to={workspacePath(destinationSlug)} replace />;
}
