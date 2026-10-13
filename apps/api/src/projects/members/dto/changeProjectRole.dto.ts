import { IsIn } from 'class-validator';
import {
  PROJECT_ROLES,
  type ChangeProjectRoleRequest,
  type ProjectRole,
} from '@repo/contracts';

export class ChangeProjectRoleDto implements ChangeProjectRoleRequest {
  @IsIn(PROJECT_ROLES)
  fromRole!: ProjectRole;

  @IsIn(PROJECT_ROLES)
  role!: ProjectRole;
}
