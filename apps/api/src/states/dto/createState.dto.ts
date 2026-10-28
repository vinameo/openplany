import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  normalizeStateName,
  STATE_COLORS,
  STATE_GROUPS,
  stateNameProblem,
  type CreateStateRequest,
  type MessageKey,
  type StateGroup,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';

@ValidatorConstraint({ name: 'stateName', async: false })
export class StateNameValidator implements ValidatorConstraintInterface {
  private lastProblemKey: MessageKey = 'state:errors.nameRequired';
  private lastProblemParams?: Record<string, string | number>;

  validate(value: unknown): boolean {
    if (value === undefined) {
      this.lastProblemKey = 'state:errors.nameRequired';
      this.lastProblemParams = undefined;
      return false;
    }
    if (typeof value !== 'string') {
      this.lastProblemKey = 'state:errors.nameInvalid';
      this.lastProblemParams = undefined;
      return false;
    }
    const problem = stateNameProblem(value);
    if (problem) {
      this.lastProblemKey = problem.key;
      this.lastProblemParams = problem.params;
      return false;
    }
    return true;
  }

  defaultMessage(): string {
    return validationMessage(this.lastProblemKey, this.lastProblemParams);
  }
}

export class CreateStateDto implements CreateStateRequest {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeStateName(value) : value,
  )
  @Validate(StateNameValidator)
  name!: string;

  @IsIn(STATE_GROUPS, {
    message: validationMessage('state:errors.groupInvalid'),
  })
  @IsDefined({
    message: validationMessage('state:errors.groupInvalid'),
  })
  group!: StateGroup;

  @IsIn(STATE_COLORS, {
    message: validationMessage('state:errors.colorInvalid'),
  })
  @IsDefined({
    message: validationMessage('state:errors.colorInvalid'),
  })
  color!: string;
}
