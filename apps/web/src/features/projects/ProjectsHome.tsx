import {
  Alert,
  Badge,
  Button,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useCurrentWorkspace } from "../workspaces/currentWorkspace/useCurrentWorkspace";
import { ProjectsTable } from "./ProjectsTable";
import { useProjects } from "./useProjects";

export function ProjectsHome() {
  const { workspace } = useCurrentWorkspace();
  const { state, reload } = useProjects(workspace.slug);

  if (state.status === "loading") {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Skeleton height={28} width={120} />
          <Skeleton height={20} width={40} radius="xl" />
        </Group>
        <Stack gap="xs">
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </Stack>
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Title order={2}>Projects</Title>
        </Group>
        <Alert color="red" role="alert">
          <Group justify="space-between" align="center">
            <Text size="sm">Couldn't load projects.</Text>
            <Button variant="subtle" color="red" size="xs" onClick={reload}>
              Retry
            </Button>
          </Group>
        </Alert>
      </Stack>
    );
  }

  const { data } = state;
  const formattedTotal = new Intl.NumberFormat("en-US").format(data.total);

  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <Title order={2}>Projects</Title>
        <Badge variant="light" color="gray" size="sm">
          {data.total}
        </Badge>
      </Group>

      {data.truncated && (
        <Alert color="yellow" role="alert">
          {`Showing the first 1,000 of ${formattedTotal} projects.`}
        </Alert>
      )}

      {data.projects.length === 0 ? (
        <Stack align="center" gap="xs" py="xl">
          <Text size="sm" c="dimmed">
            You haven't been added to any projects yet.
          </Text>
        </Stack>
      ) : (
        <ProjectsTable projects={data.projects} timeZone={workspace.timezone} />
      )}
    </Stack>
  );
}
