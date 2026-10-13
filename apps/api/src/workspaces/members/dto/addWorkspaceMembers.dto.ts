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
  MEMBER_MESSAGES,
  WORKSPACE_ROLES,
  type AddWorkspaceMembersRequest,
  type WorkspaceRole,
} from '@repo/contracts';

export class AddWorkspaceMemberDto {
  @IsUUID('4', { message: MEMBER_MESSAGES.choosePerson })
  userId!: string;

  @IsIn(WORKSPACE_ROLES, { message: MEMBER_MESSAGES.chooseRole })
  role!: WorkspaceRole;
}

export class AddWorkspaceMembersDto implements AddWorkspaceMembersRequest {
  @IsArray()
  @ArrayMinSize(1, { message: MEMBER_MESSAGES.addAtLeastOne })
  @ArrayMaxSize(ADD_MEMBERS_MAX, {
    message: MEMBER_MESSAGES.addAtMost,
  })
  @ValidateNested({ each: true })
  @Type(() => AddWorkspaceMemberDto)
  members!: AddWorkspaceMemberDto[];
}

