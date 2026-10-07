import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/apiException.js';
import { Clock } from '../auth/clock.js';
import {
  type AuthUserResponse,
  toAuthUserResponse,
} from '../auth/dto/authSessionResponse.dto.js';
import {
  type ProfileChanges,
  UsersRepository,
} from '../auth/repositories/usersRepository.js';
import type { UpdateProfileDto } from './dto/updateProfile.dto.js';

const PROFILE_FIELDS = ['firstName', 'lastName', 'displayName'] as const;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly clock: Clock,
  ) {}

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await this.users.findActiveById(userId);
    if (user === null) throw unauthenticated();
    return toAuthUserResponse(user);
  }

  /** Rules 1–7 of profile api-spec 3.2. */
  async updateMe(
    userId: string,
    dto: UpdateProfileDto,
    requestId: string,
  ): Promise<AuthUserResponse> {
    const requested: ProfileChanges = {};
    for (const field of PROFILE_FIELDS) {
      const value = dto[field];
      if (value !== undefined) requested[field] = value;
    }
    if (Object.keys(requested).length === 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Nothing to update',
      );
    }

    const user = await this.users.findActiveById(userId);
    if (user === null) throw unauthenticated();

    // Judge the state after merging: users created by the user:create script
    // have no first name, so they cannot save only a new display name.
    const current: Required<ProfileChanges> = {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      displayName: user.displayName ?? '',
    };
    const merged = { ...current, ...requested };
    const fields: Record<string, string> = {};
    if (merged.firstName === '') fields.firstName = 'Enter your first name';
    if (merged.displayName === '') fields.displayName = 'Enter a display name';
    if (Object.keys(fields).length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check the highlighted fields',
        { fields },
      );
    }

    const changes: ProfileChanges = {};
    for (const field of PROFILE_FIELDS) {
      const value = requested[field];
      if (value !== undefined && value !== current[field]) {
        changes[field] = value;
      }
    }
    if (Object.keys(changes).length === 0) return toAuthUserResponse(user);

    const updated = await this.users.updateProfile(
      userId,
      changes,
      this.clock.now(),
    );
    if (updated === null) {
      // Locked between the session check and the write.
      this.logger.warn(
        `profile.update refused requestId=${requestId} userId=${userId}`,
      );
      throw unauthenticated();
    }
    // Field names only: names are personal data and must stay out of logs.
    this.logger.log(
      `profile.updated requestId=${requestId} userId=${userId} changed=${Object.keys(changes).join(',')}`,
    );
    return toAuthUserResponse(updated);
  }
}

function unauthenticated(): ApiException {
  return new ApiException(
    HttpStatus.UNAUTHORIZED,
    'UNAUTHENTICATED',
    'Sign in to continue',
  );
}
