import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { PROJECT_ERROR_MESSAGES } from "@repo/contracts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";

export interface ProjectErrorPageProps {
  status: 403 | 404;
}

export function ProjectErrorPage({ status }: ProjectErrorPageProps) {
  const { workspace } = useCurrentWorkspace();
  const isForbidden = status === 403;

  useDocumentTitle(
    isForbidden ? "Forbidden · OpenPlany" : "Not found · OpenPlany",
  );

  const code = isForbidden ? "403" : "404";
  const title = isForbidden ? "Forbidden" : "Not Found";
  const message = isForbidden
    ? PROJECT_ERROR_MESSAGES.forbidden
    : PROJECT_ERROR_MESSAGES.notFound;

  return (
    <Container size="sm" py={96}>
      <Stack align="center" gap="md" ta="center">
        <Text
          c="dimmed"
          fw={700}
          fz={{ base: 72, sm: 96 }}
          lh={1}
          aria-hidden="true"
        >
          {code}
        </Text>
        <Title order={1} size="h2">
          {title}
        </Title>
        <Text c="dimmed" size="lg">
          {message}
        </Text>
        <Button
          component={Link}
          to={`/${encodeURIComponent(workspace.slug)}`}
          variant="filled"
        >
          Homepage
        </Button>
      </Stack>
    </Container>
  );
}
