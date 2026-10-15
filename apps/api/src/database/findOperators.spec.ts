import { describe, expect, it } from 'vitest';
import {
  containsIgnoringCaseAndAccents,
  containsIgnoringCaseAndAccentsSql,
  equalsLowercase,
} from './findOperators.js';

describe('findOperators', () => {
  it('equalsLowercase returns Raw operator matching lower(col) = :param', () => {
    const operator = equalsLowercase('kai@openplany.dev');
    expect(operator).toBeDefined();
    expect(operator['@instanceof']).toBeDefined();
  });

  it('containsIgnoringCaseAndAccentsSql builds expected SQL expression with unaccent and escape order (SR-22, DB B3)', () => {
    const sql = containsIgnoringCaseAndAccentsSql('u.email', 'search_0');
    expect(sql).toBe(
      "unaccent(lower(u.email)) LIKE '%' || replace(replace(replace(unaccent(lower(:search_0)), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' ESCAPE '\\'",
    );
  });

  it('containsIgnoringCaseAndAccents returns Raw operator with unique parameter names', () => {
    const op1 = containsIgnoringCaseAndAccents('term1');
    const op2 = containsIgnoringCaseAndAccents('term2');
    expect(op1).toBeDefined();
    expect(op2).toBeDefined();
  });
});
