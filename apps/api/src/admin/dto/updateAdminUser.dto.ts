import { IsISO8601, IsString, Matches } from 'class-validator';
import {
  DisplayNameField,
  EmailField,
  FirstNameField,
  LastNameField,
} from '../../users/dto/userFields.js';

/**
 * A full date-time with an explicit offset (`Z` or `±hh:mm`). Without one,
 * `Date.parse` would read the value in the server's time zone and the
 * stale-data check (DB B5 step 4) would depend on where the API runs.
 */
const ISO_DATE_TIME_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export class UpdateAdminUserDto {
  @Matches(ISO_DATE_TIME_WITH_OFFSET)
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
