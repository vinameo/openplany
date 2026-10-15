import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ADMIN_USER_PAGE_MAX,
  ADMIN_USER_SEARCH_MAX,
  ADMIN_USER_SORT_KEYS,
  ADMIN_USER_STATUSES,
  type AdminUserListQuery,
  type AdminUserSortKey,
  type AdminUserStatusFilter,
  defaultAdminUserOrder,
  type SortOrder,
} from '@repo/contracts';

export class ListAdminUsersQueryDto implements AdminUserListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_USER_SEARCH_MAX)
  search?: string;

  @IsOptional()
  @IsIn(ADMIN_USER_STATUSES)
  status?: AdminUserStatusFilter;

  @IsOptional()
  @IsIn(['only'])
  instanceAdmin?: 'only';

  @IsOptional()
  @IsIn(ADMIN_USER_SORT_KEYS)
  sort?: AdminUserSortKey;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_USER_PAGE_MAX)
  page?: number;

  get resolvedOrder(): SortOrder {
    if (this.order) return this.order;
    return defaultAdminUserOrder(this.sort ?? 'createdAt');
  }
}
