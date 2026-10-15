import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  AdminUserListResponse,
  CreatedUserResponse,
} from '@repo/contracts';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { AdminUsersRead } from './adminUsersAccess.decorator.js';
import { AdminUsersService } from './adminUsers.service.js';
import { CreateUserDto } from './dto/createUser.dto.js';
import { ListAdminUsersQueryDto } from './dto/listAdminUsersQuery.dto.js';
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
