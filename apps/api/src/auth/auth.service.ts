import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { ApiException } from '../common/apiException.js';
import {
  generateSessionToken,
  hashEmail,
  hashSessionToken,
} from './authTokens.js';
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
import { SessionsRepository } from './repositories/sessionsRepository.js';
import { UsersRepository } from './repositories/usersRepository.js';

export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string | null;
}

export interface SignInResult {
  body: AuthSessionResponse;
  token: string;
  expiresAt: Date;
  /** Cookie lifetime, matching the session's expiry. */
  maxAgeMs: number;
}

export interface SessionResult {
  body: AuthSessionResponse;
  /** Set when the expiry slid, so the cookie must be refreshed. */
  renewedExpiresAt: Date | null;
  renewedMaxAgeMs: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_ONLY_SESSION_MS = 15 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_USER_AGENT_LENGTH = 512;

const INVALID_CREDENTIALS = 'Incorrect email or password';

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
    const fail = async (
      reason: LoginReason,
      userId: string | null,
      result: 'failure' | 'blocked' = 'failure',
    ): Promise<void> => {
      await this.attempts.record({
        userId,
        emailHash,
        ip: context.ip,
        userAgent,
        result,
        reason,
      });
      this.logger.log(
        `sign-in ${result} reason=${reason} requestId=${context.requestId} ` +
          `userId=${userId ?? '-'} emailKey=${emailHash.slice(0, 8)}`,
      );
    };

    const limit = await this.rateLimiter.check({ ip: context.ip, emailHash });
    if (limit.blocked) {
      await fail('rate_limited', null, 'blocked');
      const minutes = Math.ceil(limit.retryAfterSeconds / 60);
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
        { retryAfterSeconds: limit.retryAfterSeconds },
      );
    }
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
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_DEACTIVATED',
        'Your account is deactivated. Contact your admin.',
      );
    }
    // Rule 7. Q5 (what is_managed means) is still open; the spec blocks it.
    if (user.isManaged) {
      await fail('managed_sso', user.id);
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'SSO_REQUIRED',
        "Sign in with your organization's SSO",
      );
    }

    const resetOnly = user.isPasswordExpired || user.isPasswordResetRequired;
    const rehashedPassword = verification.needsRehash
      ? await this.hasher.hash(dto.password)
      : null;
    const now = this.clock.now();
    const maxAgeMs = resetOnly ? RESET_ONLY_SESSION_MS : this.sessionTtlMs;
    const expiresAt = new Date(now.getTime() + maxAgeMs);
    const token = generateSessionToken();
    const reason: LoginReason | null = resetOnly ? 'reset_required' : null;

    await this.sessions.createForSignIn({
      userId: user.id,
      at: now,
      ip: context.ip,
      userAgent,
      rehashedPassword,
      session: {
        tokenHash: hashSessionToken(token),
        expiresAt,
        isResetOnly: resetOnly,
      },
      attempt: {
        userId: user.id,
        emailHash,
        ip: context.ip,
        userAgent,
        result: 'success',
        reason,
      },
    });
    this.logger.log(
      `sign-in success requestId=${context.requestId} userId=${user.id}` +
        (reason === null ? '' : ` reason=${reason}`),
    );

    return {
      body: toAuthSessionResponse(user, resetOnly),
      token,
      expiresAt,
      maxAgeMs,
    };
  }

  /** null when the cookie does not map to a usable session (api-spec 3.2). */
  async getSession(token: string): Promise<SessionResult | null> {
    const now = this.clock.now();
    const active = await this.sessions.findActive(hashSessionToken(token), now);
    if (active === null) return null;

    const { session, user } = active;
    if (!user.isActive || user.maskedAt !== null) return null;

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
      await this.sessions.touch(session, now, renewedExpiresAt);
    }

    return {
      body: toAuthSessionResponse(user, session.isResetOnly),
      renewedExpiresAt,
      renewedMaxAgeMs:
        renewedExpiresAt === null
          ? null
          : renewedExpiresAt.getTime() - now.getTime(),
    };
  }

  /** Always succeeds: sign-out must work even with a broken session. */
  async signOut(token: string | null, ip: string): Promise<void> {
    if (token === null) return;
    await this.sessions.revoke(hashSessionToken(token), ip, this.clock.now());
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
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    INVALID_CREDENTIALS,
  );
}

function truncateUserAgent(userAgent: string | null): string | null {
  return userAgent === null ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}
