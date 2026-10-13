import { Button, Group, TextInput } from '@mantine/core';
import { SearchIcon } from '../workspaces/icons';
import { RoleFilter } from './RoleFilter';
import type { RoleScheme } from './roleScheme';
import classes from './MembersToolbar.module.css';

export interface MembersToolbarProps<R extends string> {
  scheme: RoleScheme<R>;
  search: string;
  onSearchChange: (search: string) => void;
  selectedRoles: readonly R[];
  onRolesChange: (roles: R[]) => void;
  canAddMember?: boolean;
  onAddMember?: () => void;
}

export function MembersToolbar<R extends string>({
  scheme,
  search,
  onSearchChange,
  selectedRoles,
  onRolesChange,
  canAddMember = false,
  onAddMember,
}: MembersToolbarProps<R>) {
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
      <RoleFilter
        scheme={scheme}
        selectedRoles={selectedRoles}
        onChange={onRolesChange}
      />
      {canAddMember && <Button onClick={onAddMember}>Add member</Button>}
    </Group>
  );
}
