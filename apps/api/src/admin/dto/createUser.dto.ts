import {
  DisplayNameField,
  EmailField,
  FirstNameField,
  LastNameField,
  NewPasswordField,
} from '../../users/dto/userFields.js';

export class CreateUserDto {
  @FirstNameField({ requiredKey: 'users:errors.firstNameRequired' })
  firstName: string;

  @LastNameField()
  lastName?: string;

  @DisplayNameField({ requiredKey: 'users:errors.displayNameRequired' })
  displayName: string;

  @EmailField()
  email: string;

  @NewPasswordField()
  password: string;
}
