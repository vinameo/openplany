import { IsString, MaxLength } from 'class-validator';
import { validationMessage } from '../../common/validation.js';

export class SlugCheckQueryDto {
  @MaxLength(100)
  @IsString({ message: validationMessage('workspace:errors.slugRequired') })
  slug: string;
}

