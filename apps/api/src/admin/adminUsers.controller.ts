import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminUserListResponse,
  AdminUserResponse,
  CreatedUserResponse,
} from '@repo/contracts';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { MemberUserIdParam } from '../common/memberUserIdParam.js';
import {
  AdminUsersRead,
  AdminUsersWrite,
} from './adminUsersAccess.decorator.js';
import { AdminUsersService } from './adminUsers.service.js';
import { CreateUserDto } from './dto/createUser.dto.js';
import { ListAdminUsersQueryDto } from './dto/listAdminUsersQuery.dto.js';
import { UpdateAdminUserDto } from './dto/updateAdminUser.dto.js';
import {
  InstanceAdminDeniedMessage,
  InstanceAdminGuard,
} from './instanceAdminGuard.js';
import { UserCreateRateLimitGuard } from './userCreateRateLimitGuard.js';

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @AdminUsersRead()
  list(@Query() query: ListAdminUsersQueryDto): Promise<AdminUserListResponse> {
    return this.adminUsersService.list(query);
  }

  @Get(':userId')
  @AdminUsersRead()
  get(@MemberUserIdParam() userId: string): Promise<AdminUserResponse> {
    return this.adminUsersService.get(userId);
  }

  @Patch(':userId')
  @AdminUsersWrite()
  update(
    @CurrentUserId() actorId: string,
    @MemberUserIdParam() userId: string,
    @Body() dto: UpdateAdminUserDto,
    @Req() request: Request,
  ): Promise<AdminUserResponse> {
    return this.adminUsersService.update(
      actorId,
      userId,
      dto,
      request.requestId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @InstanceAdminDeniedMessage({ key: 'admin:errors.cannotCreateUsers' })
  @UseGuards(SessionGuard, UserCreateRateLimitGuard, InstanceAdminGuard)
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ): Promise<CreatedUserResponse> {
    return this.adminUsersService.create(actorId, dto, request.requestId);
  }
}
