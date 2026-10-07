import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import type { AuthUserResponse } from '../auth/dto/authSessionResponse.dto.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { UpdateProfileDto } from './dto/updateProfile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller('users/me')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getMe(@CurrentUserId() userId: string): Promise<AuthUserResponse> {
    return this.profileService.getMe(userId);
  }

  @Patch()
  updateMe(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateProfileDto,
    @Req() request: Request,
  ): Promise<AuthUserResponse> {
    return this.profileService.updateMe(userId, dto, request.requestId);
  }
}
