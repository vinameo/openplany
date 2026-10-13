import { IsIn, IsOptional } from 'class-validator';
import {
  PROJECT_ROLES,
  WORKSPACE_ROLES,
  type ChangeWorkspaceRoleRequest,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';

export class ChangeWorkspaceRoleDto implements ChangeWorkspaceRoleRequest {
  @IsIn(WORKSPACE_ROLES)
  fromRole!: WorkspaceRole;

  @IsIn(WORKSPACE_ROLES)
  role!: WorkspaceRole;

  @IsOptional()
  @IsIn(PROJECT_ROLES)
  projectRole?: ProjectRole | null;
}
