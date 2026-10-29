import type { WorkspaceRole } from "@repo/contracts";
import { WORKSPACE_ROLE_SCHEME } from "../../../members/roleScheme";
import { MembersToolbar as SharedMembersToolbar } from "../../../members/MembersToolbar";

interface MembersToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  selectedRoles: readonly WorkspaceRole[];
  onRolesChange: (roles: WorkspaceRole[]) => void;
  canAddMember?: boolean;
  onAddMember?: () => void;
}

export function MembersToolbar(props: MembersToolbarProps) {
  return <SharedMembersToolbar scheme={WORKSPACE_ROLE_SCHEME} {...props} />;
}
