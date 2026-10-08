import { IsString, MaxLength } from 'class-validator';

export class SlugCheckQueryDto {
  @MaxLength(100)
  @IsString({ message: 'Enter a workspace URL' })
  slug: string;
}

