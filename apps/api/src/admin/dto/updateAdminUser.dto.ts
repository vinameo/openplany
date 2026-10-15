import { IsISO8601, IsString, Matches } from 'class-validator';
import {
  DisplayNameField,
  EmailField,
  FirstNameField,
  LastNameField,
} from '../../users/dto/userFields.js';

export class UpdateAdminUserDto {
  @Matches(/T\d{2}:\d{2}/)
  @IsISO8601({ strict: true })
  @IsString()
  expectedUpdatedAt: string;

  @FirstNameField({
    requiredKey: 'users:errors.firstNameRequired',
    optional: true,
  })
  firstName?: string;

  @LastNameField({ optional: true })
  lastName?: string;

  @DisplayNameField({
    requiredKey: 'users:errors.displayNameRequired',
    optional: true,
  })
  displayName?: string;

  @EmailField({ optional: true })
  email?: string;
}
