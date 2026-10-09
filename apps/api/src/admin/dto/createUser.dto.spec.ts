import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from './createUser.dto.js';

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateUserDto, plain);
  const errors = await validate(dto, { stopAtFirstError: true });
  const messages = Object.fromEntries(
    errors.map((error) => [
      error.property,
      Object.values(error.constraints ?? {})[0],
    ]),
  );
  return { dto, messages, errors };
}

describe('CreateUserDto', () => {
  const validUser = {
    firstName: 'An',
    lastName: 'Nguyen',
    displayName: 'An Nguyen',
    email: 'an@openplany.dev',
    password: 'password123',
  };

  it('accepts valid input and normalizes name and email', async () => {
    const { dto, messages } = await check({
      ...validUser,
      firstName: '  An  ',
      displayName: '  An Nguyen  ',
      email: '  AN@OpenPlany.dev  ',
    });

    expect(messages).toEqual({});
    expect(dto.firstName).toBe('An');
    expect(dto.displayName).toBe('An Nguyen');
    expect(dto.email).toBe('an@openplany.dev');
  });

  it('normalizes decomposed Unicode text to NFC', async () => {
    const decomposed = 'Nguyễn'; // e + circumflex + tilde
    const { dto, messages } = await check({
      ...validUser,
      lastName: decomposed,
    });

    expect(messages).toEqual({});
    expect(dto.lastName).toBe('Nguyễn');
  });

  it('preserves surrounding whitespace in password', async () => {
    const { dto, messages } = await check({
      ...validUser,
      password: '  secret123  ',
    });

    expect(messages).toEqual({});
    expect(dto.password).toBe('  secret123  ');
  });

  it('accepts omitted or empty string lastName', async () => {
    const { messages: msg1 } = await check({
      firstName: 'An',
      displayName: 'An',
      email: 'an@openplany.dev',
      password: 'password123',
    });
    expect(msg1).toEqual({});

    const { messages: msg2 } = await check({
      ...validUser,
      lastName: '',
    });
    expect(msg2).toEqual({});
  });

  it('rejects null lastName with "Last name must be text"', async () => {
    const { messages } = await check({
      ...validUser,
      lastName: null,
    });

    expect(messages.lastName).toBe('Last name must be text');
  });

  it('validates firstName required and constraints', async () => {
    const empty = await check({ ...validUser, firstName: '' });
    expect(empty.messages.firstName).toBe('Enter a first name');

    const spaces = await check({ ...validUser, firstName: '   ' });
    expect(spaces.messages.firstName).toBe('Enter a first name');

    const nonString = await check({ ...validUser, firstName: 123 });
    expect(nonString.messages.firstName).toBe('Enter a first name');

    const tooLong = await check({ ...validUser, firstName: 'a'.repeat(51) });
    expect(tooLong.messages.firstName).toBe('First name must be 50 characters or fewer');

    const hiddenChars = await check({ ...validUser, firstName: 'An\u200B' }); // zero-width space
    expect(hiddenChars.messages.firstName).toBe("Contains characters that aren't allowed");
  });

  it('validates lastName constraints', async () => {
    const tooLong = await check({ ...validUser, lastName: 'a'.repeat(51) });
    expect(tooLong.messages.lastName).toBe('Last name must be 50 characters or fewer');

    const hiddenChars = await check({ ...validUser, lastName: 'Nguyen\u0000' }); // control char
    expect(hiddenChars.messages.lastName).toBe("Contains characters that aren't allowed");
  });

  it('validates displayName required and constraints', async () => {
    const empty = await check({ ...validUser, displayName: '' });
    expect(empty.messages.displayName).toBe('Enter a display name');

    const spaces = await check({ ...validUser, displayName: '   ' });
    expect(spaces.messages.displayName).toBe('Enter a display name');

    const nonString = await check({ ...validUser, displayName: 123 });
    expect(nonString.messages.displayName).toBe('Enter a display name');

    const tooLong = await check({ ...validUser, displayName: 'a'.repeat(51) });
    expect(tooLong.messages.displayName).toBe('Display name must be 50 characters or fewer');

    const hiddenChars = await check({ ...validUser, displayName: 'An\u200E' }); // LTR mark
    expect(hiddenChars.messages.displayName).toBe("Contains characters that aren't allowed");
  });

  it('validates email required and format', async () => {
    const nonString = await check({ ...validUser, email: 123 });
    expect(nonString.messages.email).toBe('Enter a valid email');

    const empty = await check({ ...validUser, email: '' });
    expect(empty.messages.email).toBe('Enter a valid email');

    const spaces = await check({ ...validUser, email: '   ' });
    expect(spaces.messages.email).toBe('Enter a valid email');

    const invalid = await check({ ...validUser, email: 'invalid-email' });
    expect(invalid.messages.email).toBe('Enter a valid email');

    const tooLong = await check({
      ...validUser,
      email: `${'a'.repeat(250)}@test.com`,
    });
    expect(tooLong.messages.email).toBe('Enter a valid email');
  });

  it('validates password length and type', async () => {
    const nonString = await check({ ...validUser, password: 12345678 });
    expect(nonString.messages.password).toBe('Use 8 to 128 characters');

    const tooShort = await check({ ...validUser, password: '1234567' });
    expect(tooShort.messages.password).toBe('Use 8 to 128 characters');

    const tooLong = await check({ ...validUser, password: 'a'.repeat(129) });
    expect(tooLong.messages.password).toBe('Use 8 to 128 characters');
  });

  it('never interpolates input values into error messages', async () => {
    const malicious = 'bad-input<script>alert(1)</script>';
    const { messages } = await check({
      firstName: malicious,
      lastName: malicious,
      displayName: malicious,
      email: malicious,
      password: 'short',
    });

    for (const msg of Object.values(messages)) {
      expect(msg).not.toContain(malicious);
      expect(msg).not.toContain('short');
    }
  });
});

