import { Button, Container, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useCurrentWorkspace } from "../../workspaces/currentWorkspace/useCurrentWorkspace";
import { workspacePath } from "../../workspaces/workspacePaths";

export interface ProjectErrorPageProps {
  status: 403 | 404;
}

export function ProjectErrorPage({ status }: ProjectErrorPageProps) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const isForbidden = status === 403;

  useDocumentTitle(
    isForbidden
      ? t("project:errors.forbiddenDocTitle")
      : t("project:errors.notFoundDocTitle"),
  );

  const code = isForbidden ? "403" : "404";
  const title = isForbidden
    ? t("project:errors.forbiddenTitle")
    : t("project:errors.notFoundTitle");
  const message = isForbidden
    ? t("project:errors.forbidden")
    : t("project:errors.notFound");

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
          to={workspacePath(workspace.slug)}
          variant="filled"
        >
          {t("project:detail.homepage")}
        </Button>
      </Stack>
    </Container>
  );
}
