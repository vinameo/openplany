import {
  DisplayNameField,
  FirstNameField,
  LastNameField,
} from './userFields.js';

export class UpdateProfileDto {
  @FirstNameField({
    requiredKey: 'users:errors.enterYourFirstName',
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
}
