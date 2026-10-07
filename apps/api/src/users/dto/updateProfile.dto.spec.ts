import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './updateProfile.dto.js';

async function check(plain: Record<string, unknown>) {
  const dto = plainToInstance(UpdateProfileDto, plain);
  const errors = await validate(dto, { stopAtFirstError: true });
  const messages = Object.fromEntries(
    errors.map((error) => [
      error.property,
      Object.values(error.constraints ?? {})[0],
    ]),
  );
  return { dto, messages };
}

describe('UpdateProfileDto', () => {
  it('accepts an empty body: the service decides "nothing to update"', async () => {
    const { messages } = await check({});

    expect(messages).toEqual({});
  });

  it('trims surrounding spaces', async () => {
    const { dto, messages } = await check({ firstName: '  Kai  ' });

    expect(messages).toEqual({});
    expect(dto.firstName).toBe('Kai');
  });

  it('normalizes decomposed Vietnamese text to NFC', async () => {
    const decomposed = 'Nguyễn'; // ễ as e + circumflex + tilde
    const { dto } = await check({ lastName: decomposed });

    expect(dto.lastName).toBe('Nguyễn');
  });

  it('rejects a first name of only spaces', async () => {
    const { messages } = await check({ firstName: '   ' });

    expect(messages.firstName).toBe('Enter your first name');
  });

  it('rejects a display name of only spaces', async () => {
    const { messages } = await check({ displayName: '   ' });

    expect(messages.displayName).toBe('Enter a display name');
  });

  it('accepts an empty last name', async () => {
    const { messages } = await check({ lastName: '' });

    expect(messages).toEqual({});
  });

  it('rejects null instead of treating it as omitted', async () => {
    const { messages } = await check({ firstName: null });

    expect(messages.firstName).toBe('Enter your first name');
  });

  it('rejects names over 50 characters', async () => {
    const long = 'a'.repeat(51);

    const { messages } = await check({
      firstName: long,
      lastName: long,
      displayName: long,
    });

    expect(messages).toEqual({
      firstName: 'First name must be 50 characters or fewer',
      lastName: 'Last name must be 50 characters or fewer',
      displayName: 'Display name must be 50 characters or fewer',
    });
  });

  it('accepts exactly 50 characters', async () => {
    const { messages } = await check({ displayName: 'a'.repeat(50) });

    expect(messages).toEqual({});
  });

  it.each([
    ['zero-width space', 'Ka​i'],
    ['right-to-left override', 'Kai‮'],
    ['control character', 'Ka\u0007i'],
    ['newline inside', 'Kai\nTran'],
  ])('rejects a %s', async (_label, value) => {
    const { messages } = await check({ displayName: value });

    expect(messages.displayName).toBe(
      "Contains characters that aren't allowed",
    );
  });

  it('rejects non-string values', async () => {
    const { messages } = await check({ displayName: 42 });

    expect(messages.displayName).toBe('Enter a display name');
  });
});
