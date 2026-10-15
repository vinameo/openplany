import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EMAIL_MAX,
  type MessageKey,
  normalizeName,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';

export const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export const toName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeName(value) : value;

export const toEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * Combines property decorators preserving TypeScript's bottom-up decorator execution order.
 * class-validator relies on IsString being executed first so that non-string failures
 * produce the type error before constraint validations run.
 */
function combinePropertyDecorators(
  ...decorators: PropertyDecorator[]
): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    for (let i = decorators.length - 1; i >= 0; i--) {
      decorators[i]!(target, propertyKey);
    }
  };
}

export function FirstNameField(opts: {
  requiredKey: MessageKey;
  optional?: boolean;
}): PropertyDecorator {
  const decorators: PropertyDecorator[] = [];
  if (opts.optional) {
    decorators.push(ValidateIf(isProvided));
  }
  decorators.push(
    Transform(toName),
    Matches(USER_NAME_ALLOWED, {
      message: validationMessage('users:errors.hiddenChars'),
    }),
    MaxLength(USER_NAME_MAX, {
      message: validationMessage('users:errors.firstNameTooLong', {
        max: USER_NAME_MAX,
      }),
    }),
    MinLength(1, { message: validationMessage(opts.requiredKey) }),
    IsString({ message: validationMessage(opts.requiredKey) }),
  );
  return combinePropertyDecorators(...decorators);
}

export function LastNameField(opts?: {
  optional?: boolean;
}): PropertyDecorator {
  const decorators: PropertyDecorator[] = [];
  if (opts?.optional ?? true) {
    decorators.push(ValidateIf(isProvided));
  }
  decorators.push(
    Transform(toName),
    Matches(USER_NAME_ALLOWED, {
      message: validationMessage('users:errors.hiddenChars'),
    }),
    MaxLength(USER_NAME_MAX, {
      message: validationMessage('users:errors.lastNameTooLong', {
        max: USER_NAME_MAX,
      }),
    }),
    IsString({ message: validationMessage('users:errors.lastNameText') }),
  );
  return combinePropertyDecorators(...decorators);
}

export function DisplayNameField(opts: {
  requiredKey: MessageKey;
  optional?: boolean;
}): PropertyDecorator {
  const decorators: PropertyDecorator[] = [];
  if (opts.optional) {
    decorators.push(ValidateIf(isProvided));
  }
  decorators.push(
    Transform(toName),
    Matches(USER_NAME_ALLOWED, {
      message: validationMessage('users:errors.hiddenChars'),
    }),
    MaxLength(USER_NAME_MAX, {
      message: validationMessage('users:errors.displayNameTooLong', {
        max: USER_NAME_MAX,
      }),
    }),
    MinLength(1, {
      message: validationMessage(opts.requiredKey),
    }),
    IsString({ message: validationMessage(opts.requiredKey) }),
  );
  return combinePropertyDecorators(...decorators);
}

export function EmailField(opts?: { optional?: boolean }): PropertyDecorator {
  const decorators: PropertyDecorator[] = [];
  if (opts?.optional) {
    decorators.push(ValidateIf(isProvided));
  }
  decorators.push(
    Transform(toEmail),
    MaxLength(EMAIL_MAX, {
      message: validationMessage('users:errors.emailValid'),
    }),
    IsEmail({}, { message: validationMessage('users:errors.emailValid') }),
    IsString({ message: validationMessage('users:errors.emailValid') }),
  );
  return combinePropertyDecorators(...decorators);
}

export function NewPasswordField(): PropertyDecorator {
  return combinePropertyDecorators(
    Length(PASSWORD_MIN, PASSWORD_MAX, {
      message: validationMessage('users:errors.passwordLength', {
        min: PASSWORD_MIN,
        max: PASSWORD_MAX,
      }),
    }),
    IsString({
      message: validationMessage('users:errors.passwordLength', {
        min: PASSWORD_MIN,
        max: PASSWORD_MAX,
      }),
    }),
  );
}
