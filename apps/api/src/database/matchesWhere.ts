import { FindOperator, type FindOptionsWhere } from 'typeorm';

function matchesValue(
  expected: unknown,
  actual: unknown,
  key: string,
): boolean {
  if (expected instanceof FindOperator) {
    if (expected.type === 'isNull') return actual === null;
    if (expected.type === 'not') {
      // `.value` unwraps a nested operator; `.child` keeps Not(IsNull()).
      return !matchesValue(expected.child ?? expected.value, actual, key);
    }
    throw new Error(
      `matchesWhere cannot evaluate operator "${expected.type}" on "${key}"`,
    );
  }
  if (expected === null || typeof expected !== 'object') {
    return actual === expected;
  }
  throw new Error(`matchesWhere cannot evaluate a nested filter on "${key}"`);
}

/**
 * Decides a shared `FindOptionsWhere` constant (e.g. `LISTED_USER`) on a row
 * already loaded, such as one locked FOR UPDATE, so the same constant filters
 * in SQL and in code. Supports plain values, `IsNull()` and `Not(…)` of
 * those; anything else throws, so a richer filter fails loudly in tests
 * instead of deciding wrong.
 */
export function matchesWhere<T extends object>(
  row: T,
  where: FindOptionsWhere<T>,
): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (!(key in row)) {
      throw new Error(`matchesWhere: row was loaded without "${key}"`);
    }
    const actual: unknown = (row as Record<string, unknown>)[key];
    return matchesValue(expected, actual, key);
  });
}
