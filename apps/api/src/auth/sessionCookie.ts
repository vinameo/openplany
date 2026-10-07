import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

/** Reads, sets and clears the session cookie (api-spec 6.4). */
@Injectable()
export class SessionCookie {
  readonly name: string;
  private readonly secure: boolean;

  constructor(config: ConfigService) {
    this.secure = config.getOrThrow<boolean>('SESSION_COOKIE_SECURE');
    // __Host- pins the cookie to this host and requires Secure + Path=/.
    this.name =
      this.secure && config.getOrThrow<string>('NODE_ENV') === 'production'
        ? '__Host-op_session'
        : 'op_session';
  }

  read(request: Request): string | null {
    const cookies: Record<string, unknown> = request.cookies ?? {};
    const value = cookies[this.name];
    return typeof value === 'string' && value !== '' ? value : null;
  }

  set(response: Response, token: string, maxAgeMs: number): void {
    response.cookie(this.name, token, { ...this.options(), maxAge: maxAgeMs });
  }

  clear(response: Response): void {
    response.clearCookie(this.name, this.options());
  }

  private options(): CookieOptions {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }
}
