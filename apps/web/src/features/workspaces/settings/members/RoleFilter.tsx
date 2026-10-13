import type { WorkspaceRole } from '@repo/contracts';
import { WORKSPACE_ROLE_SCHEME } from '../../../members/roleScheme';
import { RoleFilter as SharedRoleFilter } from '../../../members/RoleFilter';

interface RoleFilterProps {
  selectedRoles: readonly WorkspaceRole[];
  onChange: (roles: WorkspaceRole[]) => void;
}

export function RoleFilter({ selectedRoles, onChange }: RoleFilterProps) {
  return (
    <SharedRoleFilter
      scheme={WORKSPACE_ROLE_SCHEME}
      selectedRoles={selectedRoles}
      onChange={onChange}
    />
  );
}
