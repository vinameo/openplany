import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { englishConstraintMessage } from '../../common/validationTesting.js';
import { describe, expect, it } from 'vitest';
import { UpdateAdminUserDto } from './updateAdminUser.dto.js';

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateAdminUserDto, plain);
  const errors = await validate(dto, {
    stopAtFirstError: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const messages = Object.fromEntries(
    errors.map((error) => [
      error.property,
      englishConstraintMessage(Object.values(error.constraints ?? {})[0]),
    ]),
  );
  return { dto, messages, errors };
}

describe('UpdateAdminUserDto', () => {
  const validIso = '2026-10-15T10:00:00.000Z';

  it('accepts only expectedUpdatedAt (no changes)', async () => {
    const { dto, messages } = await check({
      expectedUpdatedAt: validIso,
    });
    expect(messages).toEqual({});
    expect(dto.expectedUpdatedAt).toBe(validIso);
    expect(dto.firstName).toBeUndefined();
    expect(dto.lastName).toBeUndefined();
    expect(dto.displayName).toBeUndefined();
    expect(dto.email).toBeUndefined();
  });

  it('accepts valid fields and normalizes them', async () => {
    const { dto, messages } = await check({
      expectedUpdatedAt: validIso,
      firstName: '  An  ',
      lastName: '  Nguyen  ',
      displayName: '  An Nguyen  ',
      email: '  AN@OpenPlany.dev  ',
    });
    expect(messages).toEqual({});
    expect(dto.firstName).toBe('An');
    expect(dto.lastName).toBe('Nguyen');
    expect(dto.displayName).toBe('An Nguyen');
    expect(dto.email).toBe('an@openplany.dev');
  });

  it('allows empty string for lastName', async () => {
    const { dto, messages } = await check({
      expectedUpdatedAt: validIso,
      lastName: '',
    });
    expect(messages).toEqual({});
    expect(dto.lastName).toBe('');
  });

  it('rejects missing or invalid expectedUpdatedAt', async () => {
    const cases = [
      {},
      { expectedUpdatedAt: '' },
      { expectedUpdatedAt: 'yesterday' },
      { expectedUpdatedAt: '2026-10-15' }, // date only without time
      { expectedUpdatedAt: '2026-10-15T10:00:00.123' }, // no offset: server-TZ dependent
      { expectedUpdatedAt: '2026-10-15T10:00' }, // no offset
      { expectedUpdatedAt: null },
      { expectedUpdatedAt: 123 },
    ];
    for (const c of cases) {
      const { messages } = await check(c as Record<string, unknown>);
      expect(messages.expectedUpdatedAt).toBeDefined();
    }
  });

  it('accepts expectedUpdatedAt with Z or a numeric offset', async () => {
    for (const expectedUpdatedAt of [
      '2026-10-15T10:00:00.123Z',
      '2026-10-15T17:00:00.123+07:00',
      '2026-10-15T10:00Z',
    ]) {
      const { messages } = await check({ expectedUpdatedAt });
      expect(messages).toEqual({});
    }
  });

  it('rejects invalid firstName', async () => {
    const cases = [
      { firstName: '' },
      { firstName: '   ' },
      { firstName: null },
      { firstName: 123 },
      { firstName: ['a'] },
      { firstName: 'a'.repeat(51) },
      { firstName: 'An\u0000' },
    ];
    for (const c of cases) {
      const { messages } = await check({
        expectedUpdatedAt: validIso,
        ...c,
      } as Record<string, unknown>);
      expect(messages.firstName).toBeDefined();
    }
  });

  it('rejects invalid lastName', async () => {
    const cases = [
      { lastName: null },
      { lastName: {} },
      { lastName: 'a'.repeat(51) },
    ];
    for (const c of cases) {
      const { messages } = await check({
        expectedUpdatedAt: validIso,
        ...c,
      } as Record<string, unknown>);
      expect(messages.lastName).toBeDefined();
    }
  });

  it('rejects empty or invalid displayName', async () => {
    const cases = [
      { displayName: '' },
      { displayName: '   ' },
      { displayName: null },
      { displayName: 'a'.repeat(51) },
    ];
    for (const c of cases) {
      const { messages } = await check({
        expectedUpdatedAt: validIso,
        ...c,
      } as Record<string, unknown>);
      expect(messages.displayName).toBeDefined();
    }
  });

  it('rejects invalid email', async () => {
    const cases = [
      { email: 'not-an-email' },
      { email: '' },
      { email: null },
      { email: `${'a'.repeat(250)}@b.co` }, // > 254 chars
    ];
    for (const c of cases) {
      const { messages } = await check({
        expectedUpdatedAt: validIso,
        ...c,
      } as Record<string, unknown>);
      expect(messages.email).toBeDefined();
    }
  });

  it('forbids unknown properties', async () => {
    const { messages } = await check({
      expectedUpdatedAt: validIso,
      isSuperuser: true,
      password: 'password123',
    });
    expect(messages.isSuperuser).toBeDefined();
    expect(messages.password).toBeDefined();
  });
});
