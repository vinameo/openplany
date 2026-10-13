import { Transform, Type } from 'class-transformer';
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
  PROJECT_ROLES,
  type AddProjectMembersRequest,
  type ProjectRole,
} from '@repo/contracts';
import { toCanonicalUserId } from '../../../common/memberRows.js';

export class AddProjectMemberDto {
  @Transform(toCanonicalUserId)
  @IsUUID('4', { message: MEMBER_MESSAGES.choosePerson })
  userId!: string;

  @IsIn(PROJECT_ROLES, { message: MEMBER_MESSAGES.chooseRole })
  role!: ProjectRole;
}

export class AddProjectMembersDto implements AddProjectMembersRequest {
  @IsArray()
  @ArrayMinSize(1, { message: MEMBER_MESSAGES.addAtLeastOne })
  @ArrayMaxSize(ADD_MEMBERS_MAX, {
    message: MEMBER_MESSAGES.addAtMost,
  })
  @ValidateNested({ each: true })
  @Type(() => AddProjectMemberDto)
  members!: AddProjectMemberDto[];
}
