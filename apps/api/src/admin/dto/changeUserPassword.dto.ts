import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PASSWORD_MAX } from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';
import { isProvided, NewPasswordField } from '../../users/dto/userFields.js';

export class ChangeUserPasswordDto {
  @NewPasswordField()
  password: string;

  /**
   * The actor's own password (step-up re-authentication, API B7). Required
   * by the service when the target is an instance admin. Like sign-in, no
   * strength policy: only a cap that bounds hashing cost.
   */
  // Decorators run bottom-up: the type check first.
  @ValidateIf(isProvided)
  @MaxLength(PASSWORD_MAX, {
    message: validationMessage('auth:errors.passwordTooLong'),
  })
  @IsNotEmpty({
    message: validationMessage('admin:users.validation.actorPasswordRequired'),
  })
  @IsString({
    message: validationMessage('admin:users.validation.actorPasswordRequired'),
  })
  actorPassword?: string;
}
