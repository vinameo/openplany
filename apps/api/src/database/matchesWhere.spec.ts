import { In, IsNull, Not } from 'typeorm';
import { matchesWhere } from './matchesWhere.js';

interface Row {
  isBot: boolean;
  maskedAt: Date | null;
  email: string | null;
}

const live: Row = { isBot: false, maskedAt: null, email: 'an@openplany.dev' };

describe('matchesWhere', () => {
  it('matches plain values and IsNull()', () => {
    expect(matchesWhere(live, { isBot: false, maskedAt: IsNull() })).toBe(true);
    expect(matchesWhere({ ...live, isBot: true }, { isBot: false })).toBe(
      false,
    );
    expect(
      matchesWhere({ ...live, maskedAt: new Date() }, { maskedAt: IsNull() }),
    ).toBe(false);
  });

  it('matches Not(IsNull()) and Not(value)', () => {
    expect(matchesWhere(live, { email: Not(IsNull()) })).toBe(true);
    const noEmail: Row = { ...live, email: null };
    expect(matchesWhere(noEmail, { email: Not(IsNull()) })).toBe(false);
    expect(matchesWhere(live, { email: Not('other@openplany.dev') })).toBe(
      true,
    );
  });

  it('matches an empty filter', () => {
    expect(matchesWhere(live, {})).toBe(true);
  });

  it('throws on operators it cannot evaluate', () => {
    expect(() => matchesWhere(live, { email: In(['a']) })).toThrow(/"in"/);
  });

  it('throws when the row was loaded without a filtered column', () => {
    const partial = { isBot: false } as Row;
    expect(() => matchesWhere(partial, { maskedAt: IsNull() })).toThrow(
      /without "maskedAt"/,
    );
  });
});
