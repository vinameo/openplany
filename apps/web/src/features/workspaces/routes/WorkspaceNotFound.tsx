import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";

export function WorkspaceNotFound() {
  useDocumentTitle("Workspace not found · OpenPlany");

  return (
    <Container size="sm" py={96}>
      <Stack align="center" gap="md" ta="center">
        <Title order={1} size="h2">
          Workspace not found
        </Title>
        <Text c="dimmed" size="lg">
          It doesn't exist or you don't have access.
        </Text>
        <Button component={Link} to="/" variant="filled">
          Go to my workspaces
        </Button>
      </Stack>
    </Container>
  );
}

