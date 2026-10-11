import { useRef, useState } from "react";
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
import {
  applyProjectListQuery,
  DEFAULT_PROJECT_SORT,
  type ProjectSortKey,
} from "./projectListView";
import { ProjectsTable } from "./ProjectsTable";
import { ProjectsToolbar } from "./ProjectsToolbar";
import { useProjects } from "./useProjects";
import type { SortState } from "../workspaces/table/SortableHeader";

export function ProjectsHome() {
  const { workspace } = useCurrentWorkspace();
  const { state, reload, addProject } = useProjects(workspace.slug);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] =
    useState<SortState<ProjectSortKey>>(DEFAULT_PROJECT_SORT);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const canCreate = workspace.permissions.includes("workspace.projects.create");

  const handleClearSearch = () => {
    setSearch("");
    searchInputRef.current?.focus();
  };

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
  const numberFormat = new Intl.NumberFormat("en-US");
  const displayedProjects = applyProjectListQuery(data.projects, {
    search,
    sort,
  });

  return (
    <>
      <Stack gap="md">
        <Group gap="xs" align="center">
          <Title order={2}>Projects</Title>
          <Badge variant="light" color="gray" size="sm">
            {data.total}
          </Badge>
        </Group>

        {data.truncated && (
          <Alert color="yellow" role="alert">
            {`Showing the first ${numberFormat.format(data.projects.length)} of ${numberFormat.format(data.total)} projects.`}
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
          <>
            <ProjectsToolbar
              ref={searchInputRef}
              search={search}
              onSearchChange={setSearch}
              canCreate={canCreate}
              onAddProject={() => setCreateModalOpened(true)}
            />

            {displayedProjects.length === 0 ? (
              <Stack align="center" gap="xs" py="xl">
                <Text size="sm" c="dimmed">
                  {`No projects match "${search}"`}
                </Text>
                <Button variant="subtle" size="sm" onClick={handleClearSearch}>
                  Clear search
                </Button>
              </Stack>
            ) : (
              <ProjectsTable
                projects={displayedProjects}
                timeZone={workspace.timezone}
                sort={sort}
                onSortChange={setSort}
              />
            )}
          </>
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
