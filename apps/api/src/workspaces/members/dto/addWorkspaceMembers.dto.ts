import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  ADD_MEMBERS_MAX,
  WORKSPACE_ROLES,
  type AddWorkspaceMembersRequest,
  type WorkspaceRole,
} from '@repo/contracts';

export class AddWorkspaceMemberDto {
  @IsUUID('4', { message: 'Choose a person' })
  userId!: string;

  @IsIn(WORKSPACE_ROLES, { message: 'Choose a role' })
  role!: WorkspaceRole;
}

export class AddWorkspaceMembersDto implements AddWorkspaceMembersRequest {
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one person' })
  @ArrayMaxSize(ADD_MEMBERS_MAX, {
    message: `Add up to ${ADD_MEMBERS_MAX} people at a time`,
  })
  @ValidateNested({ each: true })
  @Type(() => AddWorkspaceMemberDto)
  members!: AddWorkspaceMemberDto[];
}

