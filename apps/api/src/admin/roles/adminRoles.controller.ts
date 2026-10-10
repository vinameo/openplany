import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RolesResponse } from '@repo/contracts';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { InstanceAdminGuard } from '../instanceAdminGuard.js';
import { AdminRolesService } from './adminRoles.service.js';
import { UpdateRolePermissionsDto } from './dto/updateRolePermissions.dto.js';
import { RolePermissionsWriteRateLimitGuard } from './rolePermissionsWriteRateLimitGuard.js';

@Controller('admin')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Get('roles')
  @UseGuards(SessionGuard, InstanceAdminGuard)
  getRoles(): Promise<RolesResponse> {
    return this.adminRolesService.getRoles();
  }

  @Patch('role-permissions')
  @UseGuards(
    SessionGuard,
    RolePermissionsWriteRateLimitGuard,
    InstanceAdminGuard,
  )
  @HttpCode(HttpStatus.OK)
  updateRolePermissions(
    @CurrentUserId() actorId: string,
    @Body() dto: UpdateRolePermissionsDto,
    @Req() request: Request,
  ): Promise<RolesResponse> {
    return this.adminRolesService.updateRolePermissions(
      actorId,
      dto.changes,
      request.requestId ?? '',
    );
  }
}

