import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Navigate } from "react-router";
import { AuthLayout } from "../../auth/AuthLayout";
import { useWorkspaces } from "../useWorkspaces";
import { NoWorkspaceHome } from "./NoWorkspaceHome";

export function HomeRedirect() {
  const { state, refresh } = useWorkspaces();

  if (state.status === "loading") {
    return <AuthLayout title="" showCard={false} />;
  }

  if (state.status === "error") {
    return (
      <Container size="sm" py={80}>
        <Stack align="center" gap="md">
          <Title order={2}>Couldn't load your workspaces.</Title>
          <Text c="dimmed">
            An error occurred while fetching your workspaces.
          </Text>
          <Button variant="default" onClick={() => void refresh()}>
            Try again
          </Button>
        </Stack>
      </Container>
    );
  }

  if (state.workspaces.length === 0) {
    return <NoWorkspaceHome />;
  }

  const destinationSlug =
    state.lastWorkspaceSlug ?? state.workspaces[0]!.slug;

  return <Navigate to={`/${destinationSlug}`} replace />;
}

