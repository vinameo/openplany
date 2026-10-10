import { Group, TextInput } from "@mantine/core";
import type { WorkspaceRole } from "@repo/contracts";
import { SearchIcon } from "../../icons";
import { RoleFilter } from "./RoleFilter";

interface MembersToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  selectedRoles: readonly WorkspaceRole[];
  onRolesChange: (roles: WorkspaceRole[]) => void;
}

export function MembersToolbar({
  search,
  onSearchChange,
  selectedRoles,
  onRolesChange,
}: MembersToolbarProps) {
  return (
    <Group wrap="wrap" gap="sm">
      <TextInput
        placeholder="Search…"
        aria-label="Search members"
        leftSection={<SearchIcon width={14} height={14} />}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        style={{ flexGrow: 1, minWidth: 200 }}
      />
      <RoleFilter
        selectedRoles={selectedRoles}
        onChange={onRolesChange}
      />
    </Group>
  );
}

