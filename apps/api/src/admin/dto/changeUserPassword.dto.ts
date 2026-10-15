import { NewPasswordField } from '../../users/dto/userFields.js';

export class ChangeUserPasswordDto {
  @NewPasswordField()
  password: string;
}
