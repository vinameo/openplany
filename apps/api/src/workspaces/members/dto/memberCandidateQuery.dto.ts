import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { EMAIL_MAX, MEMBER_CANDIDATE_QUERY_MIN } from '@repo/contracts';

export class MemberCandidateQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(MEMBER_CANDIDATE_QUERY_MIN, EMAIL_MAX, { message: 'Type at least 3 characters' })
  email: string;
}

