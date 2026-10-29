import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { englishConstraintMessage } from '../../common/validationTesting.js';
import { describe, expect, it } from 'vitest';
import { UpdateWorkspaceDto } from './updateWorkspace.dto.js';

describe('UpdateWorkspaceDto', () => {
  async function validateDto(input: Record<string, unknown>) {
    const instance = plainToInstance(UpdateWorkspaceDto, input);
    return validate(instance);
  }

  it('allows empty object {} at DTO level', async () => {
    const errors = await validateDto({});
    expect(errors).toHaveLength(0);
  });

  it('transforms name with NFC and trim', async () => {
    const instance = plainToInstance(UpdateWorkspaceDto, {
      name: '  Tie\u0302\u0301ng Vie\u0302\u0323t  ',
    });
    expect(instance.name).toBe('Tiếng Việt');
    const errors = await validate(instance);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is whitespace only or null', async () => {
    const errorsWhitespace = await validateDto({ name: '   ' });
    expect(errorsWhitespace).toHaveLength(1);
    expect(
      englishConstraintMessage(errorsWhitespace[0]?.constraints?.minLength),
    ).toBe('Enter a workspace name');

    const errorsNull = await validateDto({ name: null });
    expect(errorsNull).toHaveLength(1);
    expect(englishConstraintMessage(errorsNull[0]?.constraints?.isString)).toBe(
      'Enter a workspace name',
    );
  });

  it('fails when timezone is not in WORKSPACE_TIMEZONES', async () => {
    const errors = await validateDto({ timezone: 'Mars/Base' });
    expect(errors).toHaveLength(1);
    expect(englishConstraintMessage(errors[0]?.constraints?.isIn)).toBe(
      'Select a valid timezone',
    );
  });

  it('accepts valid timezone and valid organizationSize', async () => {
    const errors = await validateDto({
      name: 'OpenStudy',
      organizationSize: '2-10',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(errors).toHaveLength(0);
  });
});
