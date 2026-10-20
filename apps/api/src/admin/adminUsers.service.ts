import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserResponse,
  CreatedUserResponse,
} from '@repo/contracts';
import { ADMIN_USERS_PAGE_SIZE } from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { User } from '../auth/entities/user.entity.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import { ApiException } from '../common/apiException.js';
import { isSameAsEmail, passwordSameAsEmail } from '../users/passwordRules.js';
import {
  ActorReauthentication,
  reauthenticationFailed,
} from './actorReauthentication.js';
import { type ChangeUserPasswordDto } from './dto/changeUserPassword.dto.js';
import { type CreateUserDto } from './dto/createUser.dto.js';
import { toAdminUserResponse } from './dto/adminUserResponse.dto.js';
import { toCreatedUserResponse } from './dto/createdUserResponse.dto.js';
import { type UpdateAdminUserDto } from './dto/updateAdminUser.dto.js';
import { UserEvents } from './events/userEvents.js';
import {
  AdminUsersRepository,
  EmailAlreadyExistsError,
  isActiveInstanceAdmin,
  isListedUser,
  type LockedUserWrites,
  type UserChanges,
} from './repositories/adminUsersRepository.js';
import { generateUsername } from './username.js';

const EMAIL_ALREADY_EXISTS_REF = { key: 'errors:emailAlreadyExists' } as const;

function emailAlreadyExists(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    'EMAIL_ALREADY_EXISTS',
    EMAIL_ALREADY_EXISTS_REF,
    { fields: { email: EMAIL_ALREADY_EXISTS_REF } },
  );
}

function userNotFound(): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', {
    key: 'admin:users.errors.userNotFound',
  });
}

const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'displayName',
  'email',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

/**
 * DB B5 step 5: the requested fields that differ from the row. `null` on the
 * row reads as ''; email compares lower-case.
 */
function changedUserFields(
  row: User,
  request: Partial<Record<EditableField, string>>,
): Partial<Record<EditableField, string>> {
  const changes: Partial<Record<EditableField, string>> = {};
  for (const field of EDITABLE_FIELDS) {
    const next = request[field];
    if (next === undefined) continue;
    const current = row[field] ?? '';
    const same =
      field === 'email'
        ? current.toLowerCase() === next.toLowerCase()
        : current === next;
    if (!same) changes[field] = next;
  }
  return changes;
}

interface AdminWriteRows {
  actor: User;
  target: User;
  writes: LockedUserWrites;
}

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly adminUsers: AdminUsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: UserEvents,
    private readonly clock: Clock,
    private readonly reauthentication: ActorReauthentication,
  ) {}

  async list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const { items, total } = await this.adminUsers.list(query);
    return {
      items: items.map(toAdminUserResponse),
      total,
      page,
      pageSize: ADMIN_USERS_PAGE_SIZE,
    };
  }

  async get(userId: string): Promise<AdminUserResponse> {
    const user = await this.adminUsers.findById(userId);
    if (!user) throw userNotFound();
    return toAdminUserResponse(user);
  }

  async update(
    actorId: string,
    userId: string,
    dto: UpdateAdminUserDto,
    requestId: string,
  ): Promise<AdminUserResponse> {
    const now = this.clock.now();
    const result = await this.withAdminWriteLock(
      actorId,
      userId,
      async ({ target, writes }) => {
        // Step 4: stale data, compared in JS on the locked row (RQ INV-06).
        if (target.updatedAt.getTime() !== Date.parse(dto.expectedUpdatedAt)) {
          this.logger.warn(
            `admin.users.update.conflict userId=${userId} actorId=${actorId} requestId=${requestId}`,
          );
          throw new ApiException(
            HttpStatus.CONFLICT,
            'USER_CHANGED_SINCE_LOADED',
            { key: 'admin:users.errors.changedSinceLoaded' },
          );
        }

        // Step 5: nothing changed → no write (RQ INV-07).
        const changes = changedUserFields(target, dto);
        const fields = EDITABLE_FIELDS.filter((f) => changes[f] !== undefined);
        if (fields.length === 0) return { user: target, fields };

        // Step 6: email held by any other row.
        if (
          changes.email !== undefined &&
          (await writes.emailTakenByOther(changes.email, userId))
        ) {
          throw emailAlreadyExists();
        }

        // Step 7: write (RQ INV-17: a new email is unverified).
        const write: UserChanges = {
          ...changes,
          ...(changes.email !== undefined && { isEmailVerified: false }),
          updatedAt: now,
        };
        try {
          await writes.updateUser(userId, write);
        } catch (error) {
          if (error instanceof EmailAlreadyExistsError) {
            throw emailAlreadyExists();
          }
          throw error;
        }
        // A copy: the locked row stays as read if the transaction is retried.
        return { user: Object.assign(new User(), target, write), fields };
      },
    );

    if (result.fields.length > 0) {
      try {
        await this.events.updated({
          userId,
          actorId,
          fields: result.fields,
          occurredAt: now,
          requestId,
        });
      } catch (error) {
        this.logger.error(
          `user.updated event failed userId=${userId} requestId=${requestId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return toAdminUserResponse(result.user);
  }

  async changePassword(
    actorId: string,
    userId: string,
    dto: ChangeUserPasswordDto,
    requestId: string,
  ): Promise<void> {
    if (actorId === userId) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'CANNOT_CHANGE_OWN_PASSWORD',
        { key: 'admin:users.errors.cannotChangeOwnPassword' },
      );
    }

    // Slow work before the transaction: check the actor's own password
    // (step-up, API B7) and hash the new one.
    const verifiedActorHash =
      dto.actorPassword === undefined
        ? null
        : await this.reauthentication.verify(
            actorId,
            dto.actorPassword,
            requestId,
          );
    const passwordHash = await this.hasher.hash(dto.password);
    const now = this.clock.now();

    const revokedSessionCount = await this.withAdminWriteLock(
      actorId,
      userId,
      async ({ actor, target, writes }) => {
        // Step 3b: another instance admin's password needs the actor's own,
        // still current on the locked actor row (API B7).
        if (target.isSuperuser) {
          if (verifiedActorHash === null) {
            throw new ApiException(
              HttpStatus.FORBIDDEN,
              'REAUTHENTICATION_REQUIRED',
              { key: 'admin:users.errors.reauthenticationRequired' },
              {
                fields: {
                  actorPassword: {
                    key: 'admin:users.errors.reauthenticationRequired',
                  },
                },
              },
            );
          }
          if (actor.password !== verifiedActorHash) {
            throw reauthenticationFailed();
          }
        }

        // Step 4: read the email from the locked row.
        if (isSameAsEmail(dto.password, target.email)) {
          throw passwordSameAsEmail();
        }

        // Steps 5–6 (RQ D32, INV-10).
        await writes.updateUser(userId, {
          password: passwordHash,
          isPasswordAutoset: false,
          isPasswordExpired: false,
          isPasswordResetRequired: false,
          updatedAt: now,
        });
        return writes.revokeAllSessions(userId, now);
      },
    );

    try {
      await this.events.passwordChanged({
        userId,
        actorId,
        revokedSessionCount,
        occurredAt: now,
        requestId,
      });
    } catch (error) {
      this.logger.error(
        `user.password_changed event failed userId=${userId} requestId=${requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async create(
    actorId: string,
    dto: CreateUserDto,
    requestId: string,
  ): Promise<CreatedUserResponse> {
    // S1: password !== email
    if (isSameAsEmail(dto.password, dto.email)) {
      throw passwordSameAsEmail();
    }

    // S2: Early check: email exists
    const existing = await this.users.findByEmail(dto.email);
    if (existing !== null) {
      throw emailAlreadyExists();
    }

    // S3: Hash password
    const passwordHash = await this.hasher.hash(dto.password);

    // S4: Insert user
    const now = this.clock.now();
    let row;
    try {
      row = await this.adminUsers.createUser({
        email: dto.email,
        username: generateUsername(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName ?? '',
        displayName: dto.displayName,
        createdById: actorId,
        at: now,
      });
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        throw emailAlreadyExists();
      }
      throw error;
    }

    // S5: Event publication
    try {
      await this.events.created({
        userId: row.id,
        actorId,
        occurredAt: now,
        requestId,
      });
    } catch (error) {
      this.logger.error(
        `user.created event failed userId=${row.id} requestId=${requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // S6: Return response
    return toCreatedUserResponse({
      id: row.id,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName ?? '',
      displayName: dto.displayName,
      createdAt: row.createdAt,
    });
  }

  /**
   * DB B5/B6 steps 1–3, the only place they are written: lock actor and
   * target, then the actor must be an active instance admin (403, RQ INV-11)
   * and the target a listed user (404, INV-02). Every admin write on a user
   * goes through here, including FC-01 (deactivate) and FC-02 (promote).
   */
  private withAdminWriteLock<T>(
    actorId: string,
    userId: string,
    work: (rows: AdminWriteRows) => Promise<T>,
  ): Promise<T> {
    return this.adminUsers.withLockedActorAndTarget(
      actorId,
      userId,
      async ({ actor, target, writes }) => {
        if (actor === null || !isActiveInstanceAdmin(actor)) {
          throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
            key: 'admin:errors.cannotManageUsers',
          });
        }
        if (target === null || !isListedUser(target)) throw userNotFound();
        return work({ actor, target, writes });
      },
    );
  }
}
