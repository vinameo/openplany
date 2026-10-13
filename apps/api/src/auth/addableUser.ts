import { IsNull, Not, type FindOptionsWhere } from 'typeorm';
import { User } from './entities/user.entity.js';

/** Who can be added to a workspace or project (and so who shows up as a candidate). */
export const ADDABLE_USER: FindOptionsWhere<User> = {
  isActive: true,
  isBot: false,
  maskedAt: IsNull(),
  email: Not(IsNull()),
};
