import { useState } from "react";
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
import { CreateProjectModal } from "./create/CreateProjectModal";
import { ProjectsTable } from "./ProjectsTable";
import { useProjects } from "./useProjects";

export function ProjectsHome() {
  const { workspace } = useCurrentWorkspace();
  const { state, reload, addProject } = useProjects(workspace.slug);
  const [createModalOpened, setCreateModalOpened] = useState(false);

  const canCreate = workspace.permissions.includes(
    "workspace.projects.create",
  );

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
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs" align="center">
            <Title order={2}>Projects</Title>
            <Badge variant="light" color="gray" size="sm">
              {data.total}
            </Badge>
          </Group>
          {canCreate && (
            <Button onClick={() => setCreateModalOpened(true)}>
              Add project
            </Button>
          )}
        </Group>

        {data.truncated && (
          <Alert color="yellow" role="alert">
            {`Showing the first 1,000 of ${formattedTotal} projects.`}
          </Alert>
        )}

        {data.projects.length === 0 ? (
          canCreate ? (
            <Stack align="center" gap="xs" py="xl">
              <Text size="md" fw={500}>
                No projects yet
              </Text>
              <Text size="sm" c="dimmed">
                Create a project to start tracking work.
              </Text>
              <Button mt="xs" onClick={() => setCreateModalOpened(true)}>
                Add project
              </Button>
            </Stack>
          ) : (
            <Stack align="center" gap="xs" py="xl">
              <Text size="sm" c="dimmed">
                You haven't been added to any projects yet.
              </Text>
            </Stack>
          )
        ) : (
          <ProjectsTable projects={data.projects} timeZone={workspace.timezone} />
        )}
      </Stack>

      <CreateProjectModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        onCreated={addProject}
        slug={workspace.slug}
      />
    </>
  );
}
