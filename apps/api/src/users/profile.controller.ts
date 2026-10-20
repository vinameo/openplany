import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AllowResetOnlySession,
  CurrentUserId,
} from '../auth/currentUser.decorator.js';
import type {
  AuthSessionResponse,
  AuthUserResponse,
} from '../auth/dto/authSessionResponse.dto.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { requestContext } from '../auth/requestContext.js';
import { SessionCookie } from '../auth/sessionCookie.js';
import { ChangeMyPasswordDto } from './dto/changeMyPassword.dto.js';
import { UpdateProfileDto } from './dto/updateProfile.dto.js';
import { MyPasswordChangeRateLimitGuard } from './myPasswordChangeRateLimitGuard.js';
import { MyPasswordService } from './myPassword.service.js';
import { ProfileService } from './profile.service.js';

@Controller('users/me')
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly myPasswordService: MyPasswordService,
    private readonly sessionCookie: SessionCookie,
  ) {}

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

  @Put('password')
  @AllowResetOnlySession()
  @UseGuards(MyPasswordChangeRateLimitGuard)
  @HttpCode(200)
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() dto: ChangeMyPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const currentToken = this.sessionCookie.read(request) ?? '';
    const result = await this.myPasswordService.change({
      userId,
      currentToken,
      dto,
      context: requestContext(request),
    });
    this.sessionCookie.set(response, result.token, result.maxAgeMs);
    return result.body;
  }
}
