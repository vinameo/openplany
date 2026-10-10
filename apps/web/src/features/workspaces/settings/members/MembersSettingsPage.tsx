import { useMemo, useState } from "react";
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
import {
  WORKSPACE_CREATOR_ROLE,
  type WorkspaceRole,
} from "@repo/contracts";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { AddMembersModal } from "./AddMembersModal";
import {
  applyMemberListQuery,
  DEFAULT_MEMBER_SORT,
  type MemberSort,
} from "./memberListView";
import { MembersTable } from "./MembersTable";
import { MembersToolbar } from "./MembersToolbar";
import { useWorkspaceMembers } from "./useWorkspaceMembers";

export function MembersSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const { state, reload } = useWorkspaceMembers(workspace.slug);

  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [sort, setSort] = useState<MemberSort>(DEFAULT_MEMBER_SORT);
  const [addModalOpened, setAddModalOpened] = useState(false);

  const canSeeEmail = workspace.permissions.includes(
    "workspace.members.email.view",
  );
  const canAddMember = workspace.permissions.includes(
    "workspace.members.add",
  );

  const rawMembers = state.status === "ready" ? state.data.members : undefined;
  const filteredMembers = useMemo(
    () =>
      applyMemberListQuery(
        rawMembers ?? [],
        { search, roles, sort },
        { canSeeEmail },
      ),
    [rawMembers, search, roles, sort, canSeeEmail],
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
          <Title order={2}>Members</Title>
        </Group>
        <Alert color="red" role="alert">
          <Group justify="space-between" align="center">
            <Text size="sm">Couldn't load members.</Text>
            <Button variant="subtle" color="red" size="xs" onClick={reload}>
              Try again
            </Button>
          </Group>
        </Alert>
      </Stack>
    );
  }

  const { data } = state;

  const adminMembers = data.members.filter(
    (m) => m.role === WORKSPACE_CREATOR_ROLE,
  );
  const hasActiveAdmin = adminMembers.some((m) => m.accountActive);
  const showNoActiveAdmin = !data.truncated && !hasActiveAdmin;

  const formattedTotal = new Intl.NumberFormat("en-US").format(data.total);

  const clearSearchAndFilters = () => {
    setSearch("");
    setRoles([]);
  };

  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <Title order={2}>Members</Title>
        <Badge variant="light" color="gray" size="sm">
          {data.total}
        </Badge>
      </Group>

      {data.truncated && (
        <Alert color="yellow" role="alert">
          {`Showing the first 1,000 of ${formattedTotal} members.`}
        </Alert>
      )}

      {showNoActiveAdmin && (
        <Alert color="red" role="alert">
          No active Admin. Ask your instance admin for help.
        </Alert>
      )}

      <MembersToolbar
        search={search}
        onSearchChange={setSearch}
        selectedRoles={roles}
        onRolesChange={setRoles}
        canAddMember={canAddMember}
        onAddMember={() => setAddModalOpened(true)}
      />

      {filteredMembers.length === 0 ? (
        <Stack align="center" gap="xs" py="xl">
          <Text size="sm" c="dimmed">
            No members match your search
          </Text>
          <Button variant="subtle" size="sm" onClick={clearSearchAndFilters}>
            Clear search and filters
          </Button>
        </Stack>
      ) : (
        <MembersTable
          members={filteredMembers}
          canSeeEmail={canSeeEmail}
          currentSort={sort}
          onSortChange={setSort}
        />
      )}

      <AddMembersModal
        opened={addModalOpened}
        onClose={() => setAddModalOpened(false)}
        slug={workspace.slug}
        addableRoles={data.addableRoles}
        onSuccess={reload}
      />
    </Stack>
  );
}
