import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { validationMessage } from '../../common/validation.js';

export class SignInDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: validationMessage('auth:errors.invalidEmail') })
  @MaxLength(255, { message: validationMessage('auth:errors.invalidEmail') })
  email: string;

  // No strength policy at sign-in: older passwords may predate it. The cap
  // keeps hashing cost bounded.
  @IsString({ message: validationMessage('auth:errors.passwordRequired') })
  @IsNotEmpty({ message: validationMessage('auth:errors.passwordRequired') })
  @MaxLength(128, { message: validationMessage('auth:errors.passwordTooLong') })
  password: string;
}
