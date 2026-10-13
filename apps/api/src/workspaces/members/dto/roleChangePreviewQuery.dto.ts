import { IsIn } from 'class-validator';
import { WORKSPACE_ROLES, type WorkspaceRole } from '@repo/contracts';

export class RoleChangePreviewQueryDto {
  @IsIn(WORKSPACE_ROLES)
  role!: WorkspaceRole;
}
