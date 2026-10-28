import { Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  normalizeWorkItemDescription,
  normalizeWorkItemTitle,
  workItemDescriptionProblem,
  workItemTitleProblem,
  type CreateWorkItemRequest,
} from '@repo/contracts';
import { validationMessage } from '../../common/validation.js';

@ValidatorConstraint({ name: 'workItemTitle', async: false })
export class WorkItemTitleValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    return workItemTitleProblem(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    if (typeof args.value === 'string') {
      const problem = workItemTitleProblem(args.value);
      if (problem) {
        return validationMessage(problem.key, problem.params);
      }
    }
    return validationMessage('workItem:errors.titleRequired');
  }
}

@ValidatorConstraint({ name: 'workItemDescription', async: false })
export class WorkItemDescriptionValidator
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    return workItemDescriptionProblem(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    if (typeof args.value === 'string') {
      const problem = workItemDescriptionProblem(args.value);
      if (problem) {
        return validationMessage(problem.key, problem.params);
      }
    }
    return validationMessage('workItem:errors.descriptionInvalid');
  }
}

const isProvided = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class CreateWorkItemDto implements CreateWorkItemRequest {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeWorkItemTitle(value) : value,
  )
  @Validate(WorkItemTitleValidator)
  @IsString({ message: validationMessage('workItem:errors.titleRequired') })
  title!: string;

  @ValidateIf(isProvided)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeWorkItemDescription(value) : value,
  )
  @Validate(WorkItemDescriptionValidator)
  @IsString({
    message: validationMessage('workItem:errors.descriptionInvalid'),
  })
  description?: string;

  @IsUUID('all', {
    message: validationMessage('workItem:errors.requestKeyInvalid'),
  })
  @IsString({
    message: validationMessage('workItem:errors.requestKeyInvalid'),
  })
  idempotencyKey!: string;

  @ValidateIf(isProvided)
  @IsUUID('all', {
    message: validationMessage('workItem:errors.stateInvalid'),
  })
  @IsString({
    message: validationMessage('workItem:errors.stateInvalid'),
  })
  stateId?: string;
}

