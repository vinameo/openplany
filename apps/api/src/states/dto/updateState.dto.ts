import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  registerDecorator,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  normalizeStateName,
  STATE_COLORS,
  STATE_GROUPS,
  type StateGroup,
  type UpdateStateRequest,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';
import { StateNameValidator } from './createState.dto.js';

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

@ValidatorConstraint({ name: 'hasStateUpdates', async: false })
export class HasStateUpdatesConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const object = args.object as UpdateStateDto;
    return (
      object.name !== undefined ||
      object.group !== undefined ||
      object.color !== undefined
    );
  }

  defaultMessage(): string {
    return validationMessage('state:errors.nothingToChange');
  }
}

export function HasStateUpdates(validationOptions?: ValidationOptions) {
  return function (target: Function): void {
    registerDecorator({
      name: 'hasStateUpdates',
      target: target,
      propertyName: '',
      options: validationOptions,
      validator: HasStateUpdatesConstraint,
    });
  };
}

@HasStateUpdates()
export class UpdateStateDto implements UpdateStateRequest {
  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeStateName(value) : value,
  )
  @Validate(StateNameValidator)
  name?: string;

  @ValidateIf(isProvided)
  @IsIn(STATE_GROUPS, {
    message: validationMessage('state:errors.groupInvalid'),
  })
  group?: StateGroup;

  @ValidateIf(isProvided)
  @IsIn(STATE_COLORS, {
    message: validationMessage('state:errors.colorInvalid'),
  })
  color?: string;

  @ValidateIf(isProvided)
  @IsBoolean({
    message: validationMessage('state:errors.confirmInvalid'),
  })
  confirmGroupChange?: boolean;
}
