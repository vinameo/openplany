import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ROLE_PERMISSIONS_CHANGES_MAX,
  ROLE_PERMISSIONS_PER_ROLE_MAX,
  ROLE_SCOPES,
  type RolePermissionsChange,
  type RoleScope,
  type UpdateRolePermissionsRequest,
} from '@repo/contracts';

export class RolePermissionsChangeDto implements RolePermissionsChange {
  @IsIn(ROLE_SCOPES)
  scope: RoleScope;

  @IsString()
  @Length(1, 20)
  key: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsArray()
  @ArrayMaxSize(ROLE_PERMISSIONS_PER_ROLE_MAX)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  permissions: string[];
}

export class UpdateRolePermissionsDto implements UpdateRolePermissionsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROLE_PERMISSIONS_CHANGES_MAX)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionsChangeDto)
  changes: RolePermissionsChangeDto[];
}

