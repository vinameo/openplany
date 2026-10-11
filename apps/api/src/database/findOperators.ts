import { Raw, type FindOperator } from 'typeorm';

let parameterSeq = 0;

/**
 * `lower(<column>) = value` as a find operator: TypeORM fills in the column
 * from entity metadata, so callers never spell a column name. `value` must
 * already be lower-cased; matches `lower(...)` expression indexes such as
 * users_email_lower_key.
 */
export function equalsLowercase(value: string): FindOperator<string> {
  parameterSeq = (parameterSeq + 1) % Number.MAX_SAFE_INTEGER;
  const name = `lowercase_${parameterSeq}`;
  return Raw((column) => `lower(${column}) = :${name}`, { [name]: value });
}
