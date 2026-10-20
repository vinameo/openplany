import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { type ChangeMyPasswordRequest, PASSWORD_MAX } from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';
import { NewPasswordField } from './userFields.js';

export class ChangeMyPasswordDto implements ChangeMyPasswordRequest {
  @MaxLength(PASSWORD_MAX, {
    message: validationMessage('auth:errors.passwordTooLong'),
  })
  @IsNotEmpty({
    message: validationMessage('users:errors.currentPasswordRequired'),
  })
  @IsString({
    message: validationMessage('users:errors.currentPasswordRequired'),
  })
  currentPassword!: string;

  @NewPasswordField()
  newPassword!: string;
}
