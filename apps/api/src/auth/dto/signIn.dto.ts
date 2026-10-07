import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SignInDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email' })
  @MaxLength(255, { message: 'Enter a valid email' })
  email: string;

  // No strength policy at sign-in: older passwords may predate it. The cap
  // keeps hashing cost bounded.
  @IsString({ message: 'Enter your password' })
  @IsNotEmpty({ message: 'Enter your password' })
  @MaxLength(128, { message: 'Password is too long' })
  password: string;
}
