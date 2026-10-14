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
  PROJECT_ROLES,
  type AddProjectMembersRequest,
  type ProjectRole,
} from '@repo/contracts';
import { toCanonicalUserId } from '../../../common/memberRows.js';
import { validationMessage } from '../../../common/validation.js';

export class AddProjectMemberDto {
  @Transform(toCanonicalUserId)
  @IsUUID('4', { message: validationMessage('members:errors.choosePerson') })
  userId!: string;

  @IsIn(PROJECT_ROLES, {
    message: validationMessage('members:errors.chooseRole'),
  })
  role!: ProjectRole;
}

export class AddProjectMembersDto implements AddProjectMembersRequest {
  @IsArray()
  @ArrayMinSize(1, {
    message: validationMessage('members:errors.addAtLeastOne'),
  })
  @ArrayMaxSize(ADD_MEMBERS_MAX, {
    message: validationMessage('members:errors.addAtMost', {
      max: ADD_MEMBERS_MAX,
    }),
  })
  @ValidateNested({ each: true })
  @Type(() => AddProjectMemberDto)
  members!: AddProjectMemberDto[];
}
