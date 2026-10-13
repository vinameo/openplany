import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import {
  EMAIL_MAX,
  MEMBER_CANDIDATE_QUERY_ALLOWED,
  MEMBER_CANDIDATE_QUERY_MIN,
  MEMBER_MESSAGES,
} from '@repo/contracts';

export class MemberCandidateQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(MEMBER_CANDIDATE_QUERY_MIN, EMAIL_MAX, {
    message: MEMBER_MESSAGES.candidateQueryTooShort,
  })
  @Matches(MEMBER_CANDIDATE_QUERY_ALLOWED, {
    message: MEMBER_MESSAGES.candidateQueryInvalid,
  })
  email!: string;
}
