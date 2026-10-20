import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiException } from '../common/apiException.js';
import { AuthService } from './auth.service.js';
import { clientIp, requestContext } from './requestContext.js';
import type { AuthSessionResponse } from './dto/authSessionResponse.dto.js';
import { SignInDto } from './dto/signIn.dto.js';
import { SessionCookie } from './sessionCookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() dto: SignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.authService.signIn(dto, requestContext(request));
    this.sessionCookie.set(response, result.token, result.maxAgeMs);
    return result.body;
  }

  @Get('session')
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const token = this.sessionCookie.read(request);
    const result =
      token === null ? null : await this.authService.getSession(token);
    if (result === null || result.status !== 'active') {
      if (token !== null && result?.status !== 'revoked') {
        this.sessionCookie.clear(response);
      }
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
        key: 'errors:http.unauthenticated',
      });
    }
    if (token !== null && result.renewedMaxAgeMs !== null) {
      this.sessionCookie.set(response, token, result.renewedMaxAgeMs);
    }
    return result.body;
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.signOut(
      this.sessionCookie.read(request),
      clientIp(request),
      request.requestId,
    );
    this.sessionCookie.clear(response);
  }
}
