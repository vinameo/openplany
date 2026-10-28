import { IsOptional, IsUUID } from 'class-validator';
import { validationMessage } from '../../common/validation.js';

export class DeleteStateQueryDto {
  @IsOptional()
  @IsUUID('all', {
    message: validationMessage('state:errors.replacementInvalidFormat'),
  })
  replacementStateId?: string;
}
