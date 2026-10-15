import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserResponse,
  CreatedUserResponse,
} from '@repo/contracts';
import { ADMIN_USERS_PAGE_SIZE } from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import { ApiException } from '../common/apiException.js';
import { type ChangeUserPasswordDto } from './dto/changeUserPassword.dto.js';
import { type CreateUserDto } from './dto/createUser.dto.js';
import { toAdminUserResponse } from './dto/adminUserResponse.dto.js';
import { toCreatedUserResponse } from './dto/createdUserResponse.dto.js';
import { type UpdateAdminUserDto } from './dto/updateAdminUser.dto.js';
import { UserEvents } from './events/userEvents.js';
import {
  ActorForbiddenError,
  AdminUsersRepository,
  EmailAlreadyExistsError,
  PasswordSameAsEmailError,
  TargetNotFoundError,
  UserChangedSinceLoadedError,
} from './repositories/adminUsersRepository.js';
import { generateUsername } from './username.js';

const EMAIL_ALREADY_EXISTS_REF = { key: 'errors:emailAlreadyExists' } as const;

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly adminUsers: AdminUsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: UserEvents,
    private readonly clock: Clock,
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
    if (!user) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        { key: 'admin:users.errors.userNotFound' },
      );
    }
    return toAdminUserResponse(user);
  }

  async update(
    actorId: string,
    userId: string,
    dto: UpdateAdminUserDto,
    requestId: string,
  ): Promise<AdminUserResponse> {
    const now = this.clock.now();
    let result;
    try {
      result = await this.adminUsers.updateUser(
        actorId,
        userId,
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          displayName: dto.displayName,
          email: dto.email,
        },
        dto.expectedUpdatedAt,
        now,
      );
    } catch (error) {
      if (error instanceof ActorForbiddenError) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          { key: 'admin:errors.cannotManageUsers' },
        );
      }
      if (error instanceof TargetNotFoundError) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          'USER_NOT_FOUND',
          { key: 'admin:users.errors.userNotFound' },
        );
      }
      if (error instanceof UserChangedSinceLoadedError) {
        this.logger.warn(
          `admin.users.update.conflict userId=${userId} actorId=${actorId} requestId=${requestId}`,
        );
        throw new ApiException(
          HttpStatus.CONFLICT,
          'USER_CHANGED_SINCE_LOADED',
          { key: 'admin:users.errors.changedSinceLoaded' },
        );
      }
      if (error instanceof EmailAlreadyExistsError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'EMAIL_ALREADY_EXISTS',
          EMAIL_ALREADY_EXISTS_REF,
          {
            fields: {
              email: EMAIL_ALREADY_EXISTS_REF,
            },
          },
        );
      }
      throw error;
    }

    if (result.changedFields.length > 0) {
      try {
        await this.events.updated({
          userId,
          actorId,
          fields: result.changedFields,
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

    const passwordHash = await this.hasher.hash(dto.password);
    const now = this.clock.now();

    let result: { revokedSessionCount: number };
    try {
      result = await this.adminUsers.changePassword(
        actorId,
        userId,
        passwordHash,
        dto.password,
        now,
      );
    } catch (error) {
      if (error instanceof ActorForbiddenError) {
        throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
          key: 'admin:errors.cannotManageUsers',
        });
      }
      if (error instanceof TargetNotFoundError) {
        throw new ApiException(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', {
          key: 'admin:users.errors.userNotFound',
        });
      }
      if (error instanceof PasswordSameAsEmailError) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          { key: 'errors:checkHighlightedFields' },
          {
            fields: {
              password: { key: 'users:errors.passwordSameAsEmail' },
            },
          },
        );
      }
      throw error;
    }

    try {
      await this.events.passwordChanged({
        userId,
        actorId,
        revokedSessionCount: result.revokedSessionCount,
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
    if (dto.password.toLowerCase() === dto.email.toLowerCase()) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        { key: 'errors:checkHighlightedFields' },
        {
          fields: {
            password: { key: 'users:errors.passwordSameAsEmail' },
          },
        },
      );
    }

    // S2: Early check: email exists
    const existing = await this.users.findByEmail(dto.email);
    if (existing !== null) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'EMAIL_ALREADY_EXISTS',
        EMAIL_ALREADY_EXISTS_REF,
        {
          fields: {
            email: EMAIL_ALREADY_EXISTS_REF,
          },
        },
      );
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
        throw new ApiException(
          HttpStatus.CONFLICT,
          'EMAIL_ALREADY_EXISTS',
          EMAIL_ALREADY_EXISTS_REF,
          {
            fields: {
              email: EMAIL_ALREADY_EXISTS_REF,
            },
          },
        );
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
}
