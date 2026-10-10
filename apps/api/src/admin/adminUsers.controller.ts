import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CreatedUserResponse } from '@repo/contracts';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { AdminUsersService } from './adminUsers.service.js';
import { CreateUserDto } from './dto/createUser.dto.js';
import { InstanceAdminDeniedMessage, InstanceAdminGuard } from './instanceAdminGuard.js';
import { UserCreateRateLimitGuard } from './userCreateRateLimitGuard.js';

@Controller('admin/users')
@InstanceAdminDeniedMessage("You don't have permission to create users")
@UseGuards(SessionGuard, UserCreateRateLimitGuard, InstanceAdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ): Promise<CreatedUserResponse> {
    return this.adminUsersService.create(actorId, dto, request.requestId);
  }
}

