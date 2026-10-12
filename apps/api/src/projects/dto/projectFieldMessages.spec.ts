import { describe, expect, it } from 'vitest';
import {
  PROJECT_FIELD_MESSAGES,
  projectNameProblem,
  projectDescriptionProblem,
} from '@repo/contracts';
import { ApiException } from '../../common/apiException.js';
import { createValidationPipe } from '../../common/validation.js';
import { CreateProjectDto } from './createProject.dto.js';

describe('Project field messages and validation consistency (API B6, B11.1)', () => {
  const pipe = createValidationPipe();

  async function validateCreate(
    payload: unknown,
  ): Promise<Record<string, string>> {
    try {
      await pipe.transform(payload, { type: 'body', metatype: CreateProjectDto });
      return {};
    } catch (err) {
      if (err instanceof ApiException) {
        return err.fields ?? {};
      }
      throw err;
    }
  }

  const validBase = {
    name: 'Valid Name',
    identifier: 'VAL',
    icon: { name: 'star', color: '#FAB005' },
    coverKey: 'cover-01',
  };

  describe('name string inputs (B6 rows 3–5) match between DTO and projectNameProblem', () => {
    it('row 3: empty or whitespace string gives nameRequired', async () => {
      for (const name of ['', '   ']) {
        const fields = await validateCreate({ ...validBase, name });
        expect(fields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);
        expect(projectNameProblem(name)).toBe(
          PROJECT_FIELD_MESSAGES.nameRequired,
        );
      }
    });

    it('row 4: over-length string (81 chars) gives nameTooLong', async () => {
      const name = 'a'.repeat(81);
      const fields = await validateCreate({ ...validBase, name });
      expect(fields.name).toBe(PROJECT_FIELD_MESSAGES.nameTooLong);
      expect(projectNameProblem(name)).toBe(PROJECT_FIELD_MESSAGES.nameTooLong);
    });

    it('row 5: strings with hidden chars give hiddenChars', async () => {
      for (const name of ['Project \u0000', 'Project \u202E', 'Project \u200B']) {
        const fields = await validateCreate({ ...validBase, name });
        expect(fields.name).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);
        expect(projectNameProblem(name)).toBe(
          PROJECT_FIELD_MESSAGES.hiddenChars,
        );
      }
    });
  });

  describe('description string inputs (B6 rows 10–11) match between DTO and projectDescriptionProblem', () => {
    it('row 10: over-length description (2001 chars) gives descriptionTooLong', async () => {
      const description = 'a'.repeat(2001);
      const fields = await validateCreate({ ...validBase, description });
      expect(fields.description).toBe(
        PROJECT_FIELD_MESSAGES.descriptionTooLong,
      );
      expect(projectDescriptionProblem(description)).toBe(
        PROJECT_FIELD_MESSAGES.descriptionTooLong,
      );
    });

    it('row 11: description with control chars (NUL, bell) gives hiddenChars', async () => {
      for (const description of ['Desc \u0000', 'Desc \u0007']) {
        const fields = await validateCreate({ ...validBase, description });
        expect(fields.description).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);
        expect(projectDescriptionProblem(description)).toBe(
          PROJECT_FIELD_MESSAGES.hiddenChars,
        );
      }
    });
  });

  describe('non-string or nested inputs (B6 rows 6, 13, 14, 16) through DTO', () => {
    it('row 6: invalid name types give nameRequired', async () => {
      for (const name of [123, null, ['a']]) {
        const fields = await validateCreate({ ...validBase, name });
        expect(fields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);
      }
    });

    it('row 13: invalid description types give descriptionTooLong', async () => {
      for (const description of [null, 5]) {
        const fields = await validateCreate({ ...validBase, description });
        expect(fields.description).toBe(
          PROJECT_FIELD_MESSAGES.descriptionTooLong,
        );
      }
    });

    it('row 14: invalid icon shapes give iconRequired', async () => {
      for (const icon of [null, [], 'star']) {
        const fields = await validateCreate({ ...validBase, icon });
        expect(fields.icon).toBe(PROJECT_FIELD_MESSAGES.iconRequired);
      }
    });

    it('row 16: invalid icon color gives iconColorInvalid', async () => {
      const fieldsInvalidColor = await validateCreate({
        ...validBase,
        icon: { name: 'star', color: 'red' },
      });
      expect(fieldsInvalidColor['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );

      const fieldsMissingColor = await validateCreate({
        ...validBase,
        icon: { name: 'star' },
      });
      expect(fieldsMissingColor['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );
    });
  });
});
