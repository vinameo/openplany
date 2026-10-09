import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { CreatedUserResponse } from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import { ApiException } from '../common/apiException.js';
import { type CreateUserDto } from './dto/createUser.dto.js';
import { toCreatedUserResponse } from './dto/createdUserResponse.dto.js';
import { UserEvents } from './events/userEvents.js';
import {
  AdminUsersRepository,
  EmailAlreadyExistsError,
} from './repositories/adminUsersRepository.js';
import { generateUsername } from './username.js';

const EMAIL_ALREADY_EXISTS_MESSAGE = 'A user with this email already exists.';

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
        'Check the highlighted fields',
        {
          fields: {
            password: "Password can't be the same as the email",
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
        EMAIL_ALREADY_EXISTS_MESSAGE,
        {
          fields: {
            email: EMAIL_ALREADY_EXISTS_MESSAGE,
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
          EMAIL_ALREADY_EXISTS_MESSAGE,
          {
            fields: {
              email: EMAIL_ALREADY_EXISTS_MESSAGE,
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

