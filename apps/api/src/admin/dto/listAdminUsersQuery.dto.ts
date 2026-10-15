import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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
  normalizeAdminUserSearch,
  type SortOrder,
  USER_NAME_ALLOWED,
} from '@repo/contracts';

export class ListAdminUsersQueryDto implements AdminUserListQuery {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return normalizeAdminUserSearch(value);
  })
  @Matches(USER_NAME_ALLOWED)
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
  @Transform(({ value }) => {
    if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
      return Number.parseInt(value, 10);
    }
    return value;
  })
  @IsInt()
  @Min(1)
  @Max(ADMIN_USER_PAGE_MAX)
  page?: number;
}
