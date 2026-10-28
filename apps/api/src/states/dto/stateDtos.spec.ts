import { describe, expect, it } from 'vitest';
import { ApiException } from '../../common/apiException.js';
import { createValidationPipe } from '../../common/validation.js';
import { CreateStateDto } from './createState.dto.js';
import { UpdateStateDto } from './updateState.dto.js';

describe('State DTOs validation (API B3, B4)', () => {
  const pipe = createValidationPipe();

  async function validateCreate(
    payload: unknown,
  ): Promise<Record<string, string>> {
    try {
      await pipe.transform(payload, { type: 'body', metatype: CreateStateDto });
      return {};
    } catch (err) {
      if (err instanceof ApiException) {
        return err.getEnglishFields() ?? {};
      }
      throw err;
    }
  }

  async function validateUpdate(
    payload: unknown,
  ): Promise<Record<string, string>> {
    try {
      await pipe.transform(payload, { type: 'body', metatype: UpdateStateDto });
      return {};
    } catch (err) {
      if (err instanceof ApiException) {
        return err.getEnglishFields() ?? {};
      }
      throw err;
    }
  }

  const validCreate = {
    name: 'In Review',
    group: 'active',
    color: '#8E98A8',
  };

  it('accepts valid CreateStateDto', async () => {
    const fields = await validateCreate(validCreate);
    expect(fields).toEqual({});
  });

  it('rejects missing name, group, color with appropriate messages', async () => {
    const fields = await validateCreate({});
    expect(fields.name).toBe('Enter a name');
    expect(fields.group).toBe('Choose a group');
    expect(fields.color).toBe('Choose a color from the list');
  });

  it('rejects invalid name types (null, number, array, object) with nameInvalid', async () => {
    for (const name of [null, 123, [], {}]) {
      const fields = await validateCreate({ ...validCreate, name });
      expect(fields.name).toBe('Enter the name as text');
    }
  });

  it('rejects empty or whitespace name with nameRequired', async () => {
    for (const name of ['', '   ']) {
      const fields = await validateCreate({ ...validCreate, name });
      expect(fields.name).toBe('Enter a name');
    }
  });

  it('rejects name > 40 chars with nameTooLong', async () => {
    const name = 'a'.repeat(41);
    const fields = await validateCreate({ ...validCreate, name });
    expect(fields.name).toBe('Name must be at most 40 characters');
  });

  it('accepts 40 chars with surrounding whitespace and normalizes it', async () => {
    const name = `  ${'a'.repeat(40)}  `;
    const res = (await pipe.transform(
      { ...validCreate, name },
      { type: 'body', metatype: CreateStateDto },
    )) as CreateStateDto;
    expect(res.name).toBe('a'.repeat(40));
  });

  it('rejects name with hidden characters', async () => {
    for (const hidden of ['\n', '\t', '\0', '\u200B', '\u202E']) {
      const fields = await validateCreate({
        ...validCreate,
        name: `Review${hidden}State`,
      });
      expect(fields.name).toBe(
        "Name can't contain line breaks or hidden characters",
      );
    }
  });

  it('rejects invalid group values', async () => {
    for (const group of ['Backlog', 'done', '', null, 1]) {
      const fields = await validateCreate({ ...validCreate, group });
      expect(fields.group).toBe('Choose a group');
    }
  });

  it('rejects invalid color values', async () => {
    for (const color of ['#8e98a8', 'red', '#FFF', '#123456', null]) {
      const fields = await validateCreate({ ...validCreate, color });
      expect(fields.color).toBe('Choose a color from the list');
    }
  });

  it('rejects empty update with nothingToChange', async () => {
    const fields = await validateUpdate({});
    expect(fields['']).toBe('Change at least one field');
  });

  it('rejects update with only confirmGroupChange with nothingToChange', async () => {
    const fields = await validateUpdate({ confirmGroupChange: true });
    expect(fields['']).toBe('Change at least one field');
  });

  it('rejects invalid confirmGroupChange types with confirmInvalid', async () => {
    for (const confirmGroupChange of ['true', 1, null]) {
      const fields = await validateUpdate({
        name: 'New Name',
        confirmGroupChange,
      });
      expect(fields.confirmGroupChange).toBe('Confirm the change again.');
    }
  });

  it('accepts valid update with single field', async () => {
    expect(await validateUpdate({ name: 'Testing' })).toEqual({});
    expect(await validateUpdate({ group: 'planned' })).toEqual({});
    expect(await validateUpdate({ color: '#2F9E6E' })).toEqual({});
  });
});
