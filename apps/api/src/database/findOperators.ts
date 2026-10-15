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

/**
 * Generates the SQL snippet for matching `column` with `paramName` ignoring case and accents,
 * with literal matching for wildcard/escape characters (%, _, \ and fullwidth variants).
 *
 * Required order (SR-22 / DB B3):
 * 1. unaccent(lower(:param)) runs first.
 * 2. Escape \, %, _ in SQL using nested replace.
 * 3. Wrap in '%' || ... || '%' and match via LIKE ... ESCAPE '\'.
 */
export function containsIgnoringCaseAndAccentsSql(
  column: string,
  paramName: string,
): string {
  return `unaccent(lower(${column})) LIKE '%' || replace(replace(replace(unaccent(lower(:${paramName})), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'`;
}

/**
 * unaccent(lower(<cột>)) LIKE '%' || <thoát>(unaccent(lower(:term))) || '%' ESCAPE '\':
 * khớp một phần, không phân biệt hoa thường và dấu; %, _, \ (kể cả dạng
 * fullwidth) khớp nghĩa đen.
 */
export function containsIgnoringCaseAndAccents(
  term: string,
): FindOperator<string> {
  parameterSeq = (parameterSeq + 1) % Number.MAX_SAFE_INTEGER;
  const name = `unaccent_${parameterSeq}`;
  return Raw((column) => containsIgnoringCaseAndAccentsSql(column, name), {
    [name]: term,
  });
}
