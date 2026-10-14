import { describe, expect, it } from 'vitest';
import { ApiException, resolveApiFields } from './apiException.js';
import { createValidationPipe, decodeValidationMessage, validationMessage } from './validation.js';
import { CreateWorkspaceDto } from '../workspaces/dto/createWorkspace.dto.js';

const VALID_WORKSPACE = {
  name: 'Acme',
  slug: 'acme',
  organizationSize: '2-10',
};

async function validationError(payload: unknown): Promise<ApiException> {
  const pipe = createValidationPipe();
  try {
    await pipe.transform(payload, { type: 'body', metatype: CreateWorkspaceDto });
  } catch (err) {
    if (err instanceof ApiException) return err;
    throw err;
  }
  throw new Error('Expected the payload to fail validation');
}

describe('validationMessage', () => {
  it('decodes to the MessageRef it encodes, params included', () => {
    const message = validationMessage('workspace:errors.nameTooLong', { max: 80 });
    expect(decodeValidationMessage(message)).toEqual({
      key: 'workspace:errors.nameTooLong',
      params: { max: 80 },
    });
  });

  it('leaves class-validator sentences undecoded', () => {
    expect(decodeValidationMessage('name must be a string')).toBeNull();
    expect(decodeValidationMessage('Check the highlighted fields')).toBeNull();
  });
});

describe('createValidationPipe', () => {
  // Two @Matches on one property (INV-06): each failure keeps its own sentence.
  it.each([
    {
      name: 'see http://x.com',
      en: 'Workspace name cannot contain a URL',
      vi: 'Tên Workspace không thể chứa liên kết URL',
    },
    {
      name: 'Acme​',
      en: "Contains characters that aren't allowed",
      vi: 'Chứa ký tự không được phép',
    },
  ])('reports the decorator that failed for name $name', async ({ name, en, vi }) => {
    const err = await validationError({ ...VALID_WORKSPACE, name });
    expect(err.getEnglishFields()).toEqual({ name: en });
    expect(resolveApiFields(err.fieldErrors, 'vi')).toEqual({ name: vi });
  });

  it('keeps class-validator text for constraints without a declared message', async () => {
    const err = await validationError({ ...VALID_WORKSPACE, extra: 1 });
    expect(err.fieldErrors).toEqual({
      extra: { libraryText: 'property extra should not exist' },
    });
    expect(resolveApiFields(err.fieldErrors, 'vi')).toEqual({
      extra: 'Dữ liệu gửi lên không hợp lệ',
    });
  });
});
