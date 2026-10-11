import { Button, Group, TextInput } from "@mantine/core";
import type { WorkspaceRole } from "@repo/contracts";
import { SearchIcon } from "../../icons";
import { RoleFilter } from "./RoleFilter";
import classes from "./MembersToolbar.module.css";

interface MembersToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  selectedRoles: readonly WorkspaceRole[];
  onRolesChange: (roles: WorkspaceRole[]) => void;
  canAddMember?: boolean;
  onAddMember?: () => void;
}

export function MembersToolbar({
  search,
  onSearchChange,
  selectedRoles,
  onRolesChange,
  canAddMember = false,
  onAddMember,
}: MembersToolbarProps) {
  return (
    <Group wrap="wrap" gap="sm">
      <TextInput
        placeholder="Search…"
        aria-label="Search members"
        leftSection={<SearchIcon width={14} height={14} />}
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        className={classes.search}
      />
      <RoleFilter selectedRoles={selectedRoles} onChange={onRolesChange} />
      {canAddMember && <Button onClick={onAddMember}>Add member</Button>}
    </Group>
  );
}
