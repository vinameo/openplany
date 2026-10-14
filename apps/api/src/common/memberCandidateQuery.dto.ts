import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import {
  EMAIL_MAX,
  MEMBER_CANDIDATE_QUERY_ALLOWED,
  MEMBER_CANDIDATE_QUERY_MIN,
} from '@repo/contracts';
import { validationMessage } from './validation.js';

export class MemberCandidateQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(MEMBER_CANDIDATE_QUERY_MIN, EMAIL_MAX, {
    message: validationMessage('members:errors.candidateQueryTooShort'),
  })
  @Matches(MEMBER_CANDIDATE_QUERY_ALLOWED, {
    message: validationMessage('members:errors.candidateQueryInvalid'),
  })
  email!: string;
}
