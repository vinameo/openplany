import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export type NullsAndEmptyLastOrder = 'ASC' | 'DESC';

/**
 * Adds an ORDER BY clause placing NULL and empty string values last regardless of sort direction.
 */
export function addOrderByEmptyAndNullLast<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  columnSql: string,
  order: NullsAndEmptyLastOrder,
  isFirst = false,
): SelectQueryBuilder<T> {
  const caseSql = `CASE WHEN ${columnSql} IS NULL OR ${columnSql} = '' THEN 1 ELSE 0 END`;
  if (isFirst) {
    qb.orderBy(caseSql, 'ASC');
  } else {
    qb.addOrderBy(caseSql, 'ASC');
  }
  qb.addOrderBy(columnSql, order);
  return qb;
}
