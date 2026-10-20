import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { ApiException } from '../common/apiException.js';
import { hashEmail, hashSessionToken } from './authTokens.js';
import { Clock } from './clock.js';
import {
  type AuthSessionResponse,
  toAuthSessionResponse,
} from './dto/authSessionResponse.dto.js';
import type { SignInDto } from './dto/signIn.dto.js';
import type { LoginReason } from './entities/loginAttempt.entity.js';
import type { User } from './entities/user.entity.js';
import { PasswordHasher } from './passwordHasher.js';
import { LoginRateLimiter } from './rateLimiter.js';
import { LoginAttemptsRepository } from './repositories/loginAttemptsRepository.js';
import {
  SessionsRepository,
  StaleCredentialsError,
} from './repositories/sessionsRepository.js';
import { UsersRepository } from './repositories/usersRepository.js';
import { type RequestContext, truncateUserAgent } from './requestContext.js';
import { DAY_MS, SessionIssuer } from './sessionIssuer.js';

export interface SignInResult {
  body: AuthSessionResponse;
  token: string;
  expiresAt: Date;
  /** Cookie lifetime, matching the session's expiry. */
  maxAgeMs: number;
}

export type SessionResult =
  | {
      status: 'active';
      body: AuthSessionResponse;
      /** Set when the expiry slid, so the cookie must be refreshed. */
      renewedExpiresAt: Date | null;
      renewedMaxAgeMs: number | null;
    }
  | { status: 'revoked' }
  | { status: 'unusable' };

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly hmacSecret: string;
  private readonly sessionTtlMs: number;
  private readonly sessionAbsoluteTtlMs: number;
  /** Verified against when no usable user exists, to equalise timing (R4). */
  private dummyHash: string;

  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly attempts: LoginAttemptsRepository,
    private readonly hasher: PasswordHasher,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly clock: Clock,
    private readonly sessionIssuer: SessionIssuer,
    config: ConfigService,
  ) {
    this.hmacSecret = config.getOrThrow<string>('AUTH_HMAC_SECRET');
    this.sessionTtlMs = config.getOrThrow<number>('SESSION_TTL_DAYS') * DAY_MS;
    this.sessionAbsoluteTtlMs =
      config.getOrThrow<number>('SESSION_ABSOLUTE_TTL_DAYS') * DAY_MS;
  }

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash(randomBytes(32).toString('hex'));
  }

  /** Rules 0–11 of login-analysis.md, in order (api-spec 4). */
  async signIn(dto: SignInDto, context: RequestContext): Promise<SignInResult> {
    const emailHash = hashEmail(this.hmacSecret, dto.email);
    const userAgent = truncateUserAgent(context.userAgent);
    const limit = await this.rateLimiter.reserve({
      ip: context.ip,
      emailHash,
      userAgent,
    });
    if (limit.blocked) {
      this.logger.log(
        `sign-in blocked reason=rate_limited requestId=${context.requestId} ` +
          `userId=- emailKey=${emailHash.slice(0, 8)}`,
      );
      const minutes = Math.ceil(limit.retryAfterSeconds / 60);
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        { key: 'auth:errors.tooManyAttempts', params: { count: minutes } },
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }
    const fail = async (
      reason: LoginReason,
      userId: string | null,
    ): Promise<void> => {
      await this.attempts.finish(limit.attemptId, {
        userId,
        result: 'failure',
        reason,
      });
      this.logger.log(
        `sign-in failure reason=${reason} requestId=${context.requestId} ` +
          `userId=${userId ?? '-'} emailKey=${emailHash.slice(0, 8)}`,
      );
    };
    if (limit.delayMs > 0) await this.clock.sleep(limit.delayMs);

    const user = await this.users.findByEmail(dto.email);
    const unusable = user === null ? 'unknown_email' : unusableReason(user);
    if (user === null || unusable !== null) {
      await this.hasher.verify(this.dummyHash, dto.password);
      await fail(unusable ?? 'unknown_email', user?.id ?? null);
      throw invalidCredentials();
    }

    const verification = await this.hasher.verify(user.password, dto.password);
    if (!verification.ok) {
      await fail('wrong_password', user.id);
      throw invalidCredentials();
    }

    // Only revealed once the password is proven correct (rule 6).
    if (!user.isActive) {
      await fail('inactive', user.id);
      throw new ApiException(HttpStatus.FORBIDDEN, 'ACCOUNT_DEACTIVATED', {
        key: 'auth:errors.accountDeactivated',
      });
    }
    // Rule 7. Q5 (what is_managed means) is still open; the spec blocks it.
    if (user.isManaged) {
      await fail('managed_sso', user.id);
      throw new ApiException(HttpStatus.FORBIDDEN, 'SSO_REQUIRED', {
        key: 'auth:errors.ssoRequired',
      });
    }

    const resetOnly = user.isPasswordExpired || user.isPasswordResetRequired;
    const rehashedPassword = verification.needsRehash
      ? await this.hasher.hash(dto.password)
      : null;
    const now = this.clock.now();
    const issued = this.sessionIssuer.issue({
      userId: user.id,
      now,
      resetOnly,
      ip: context.ip,
      userAgent: context.userAgent,
    });
    const reason: LoginReason | null = resetOnly ? 'reset_required' : null;

    try {
      await this.sessions.createForSignIn({
        userId: user.id,
        verifiedHash: user.password,
        at: now,
        ip: context.ip,
        userAgent,
        rehashedPassword,
        session: issued.record,
        attempt: {
          id: limit.attemptId,
          outcome: { userId: user.id, result: 'success', reason },
        },
      });
    } catch (err) {
      if (err instanceof StaleCredentialsError) {
        await fail('wrong_password', user.id);
        throw invalidCredentials();
      }
      throw err;
    }
    this.logger.log(
      `sign-in success requestId=${context.requestId} userId=${user.id}` +
        (reason === null ? '' : ` reason=${reason}`),
    );

    return {
      body: toAuthSessionResponse(user, resetOnly),
      token: issued.token,
      expiresAt: issued.record.expiresAt,
      maxAgeMs: issued.maxAgeMs,
    };
  }

  /** Evaluates the session behind the cookie (api-spec B4.4, DB B4). */
  async getSession(token: string): Promise<SessionResult> {
    const now = this.clock.now();
    const lookup = await this.sessions.lookupSession(
      hashSessionToken(token),
      now,
    );
    if (lookup.status === 'revoked') {
      return { status: 'revoked' };
    }
    if (lookup.status !== 'active') {
      return { status: 'unusable' };
    }

    const { session, user } = lookup;
    if (!user.isActive || user.maskedAt !== null) {
      return { status: 'unusable' };
    }

    let renewedExpiresAt: Date | null = null;
    const stale =
      now.getTime() - session.lastUsedAt.getTime() > SESSION_TOUCH_INTERVAL_MS;
    if (stale && !session.isResetOnly) {
      renewedExpiresAt = new Date(
        Math.min(
          now.getTime() + this.sessionTtlMs,
          session.createdAt.getTime() + this.sessionAbsoluteTtlMs,
        ),
      );
      const touched = await this.sessions.touch(session, now, renewedExpiresAt);
      if (!touched) {
        return { status: 'revoked' };
      }
    }

    return {
      status: 'active',
      body: toAuthSessionResponse(user, session.isResetOnly),
      renewedExpiresAt,
      renewedMaxAgeMs:
        renewedExpiresAt === null
          ? null
          : renewedExpiresAt.getTime() - now.getTime(),
    };
  }

  /** Always succeeds: sign-out must work even with a broken session (api-spec B6). */
  async signOut(
    token: string | null,
    ip: string,
    requestId?: string,
  ): Promise<void> {
    if (token === null) return;
    const userId = await this.sessions.revoke(
      hashSessionToken(token),
      ip,
      this.clock.now(),
    );
    if (userId !== null) {
      this.logger.log(
        `auth.signed_out userId=${userId} requestId=${requestId ?? '-'}`,
      );
    }
  }
}

/** Rules 2–4: accounts treated exactly like an unknown email. */
function unusableReason(user: User): LoginReason | null {
  if (user.maskedAt !== null) return 'masked';
  if (user.isBot) return 'bot';
  if (user.isPasswordAutoset) return 'password_not_set';
  return null;
}

function invalidCredentials(): ApiException {
  return new ApiException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', {
    key: 'auth:errors.invalidCredentials',
  });
}
