import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { englishConstraintMessage } from '../../common/validationTesting.js';
import { describe, expect, it } from 'vitest';
import { ChangeUserPasswordDto } from './changeUserPassword.dto.js';

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(ChangeUserPasswordDto, plain);
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

describe('ChangeUserPasswordDto', () => {
  it('accepts valid passwords and does not trim whitespace (API B3.3)', async () => {
    const valid = '  spaces  ';
    const { dto, messages } = await check({ password: valid });
    expect(messages).toEqual({});
    expect(dto.password).toBe(valid);
  });

  it('accepts 8-character password', async () => {
    const { dto, messages } = await check({ password: 'a'.repeat(8) });
    expect(messages).toEqual({});
    expect(dto.password).toBe('a'.repeat(8));
  });

  it('accepts 128-character password', async () => {
    const { dto, messages } = await check({ password: 'a'.repeat(128) });
    expect(messages).toEqual({});
    expect(dto.password).toBe('a'.repeat(128));
  });

  it('rejects short passwords (< 8 chars)', async () => {
    const { messages } = await check({ password: 'short' });
    expect(messages.password).toBe('Use 8 to 128 characters');
  });

  it('rejects long passwords (> 128 chars)', async () => {
    const { messages } = await check({ password: 'a'.repeat(129) });
    expect(messages.password).toBe('Use 8 to 128 characters');
  });

  it('rejects missing or non-string password', async () => {
    const cases = [
      {},
      { password: null },
      { password: 12345678 },
      { password: ['a'.repeat(8)] },
    ];
    for (const c of cases) {
      const { messages } = await check(c as Record<string, unknown>);
      expect(messages.password).toBeDefined();
    }
  });

  it('accepts an actorPassword without trimming it', async () => {
    const { dto, messages } = await check({
      password: 'validPassword123',
      actorPassword: ' mine ',
    });
    expect(messages).toEqual({});
    expect(dto.actorPassword).toBe(' mine ');
  });

  it('rejects an empty, non-string or over-long actorPassword', async () => {
    const cases = [
      { actorPassword: '' },
      { actorPassword: null },
      { actorPassword: 123 },
      { actorPassword: ['x'] },
    ];
    for (const c of cases) {
      const { messages } = await check({ password: 'validPassword123', ...c });
      expect(messages.actorPassword).toBe('Enter your password');
    }
    const { messages } = await check({
      password: 'validPassword123',
      actorPassword: 'a'.repeat(129),
    });
    expect(messages.actorPassword).toBe('Password is too long');
  });

  it('rejects unwhitelisted properties', async () => {
    const { errors } = await check({
      password: 'validPassword123',
      extra: 'not-allowed',
    });
    expect(errors.some((e) => e.property === 'extra')).toBe(true);
  });
});
