import { applyDecorators, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import {
  AdminUsersReadRateLimitGuard,
  AdminUsersWriteRateLimitGuard,
} from './adminUsersRateLimitGuards.js';
import {
  InstanceAdminDeniedMessage,
  InstanceAdminGuard,
} from './instanceAdminGuard.js';

export const AdminUsersRead = () =>
  applyDecorators(
    UseGuards(SessionGuard, AdminUsersReadRateLimitGuard, InstanceAdminGuard),
    InstanceAdminDeniedMessage({ key: 'admin:errors.cannotManageUsers' }),
  );

export const AdminUsersWrite = () =>
  applyDecorators(
    UseGuards(SessionGuard, AdminUsersWriteRateLimitGuard, InstanceAdminGuard),
    InstanceAdminDeniedMessage({ key: 'admin:errors.cannotManageUsers' }),
  );
