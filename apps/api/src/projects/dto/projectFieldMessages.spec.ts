import { describe, expect, it } from 'vitest';
import {
  PROJECT_FIELD_MESSAGES,
  PROJECT_FIELD_MESSAGE_REFS,
  TIMEZONE_MESSAGES,
  projectNameProblem,
  projectDescriptionProblem,
} from '@repo/contracts';
import { ApiException } from '../../common/apiException.js';
import { createValidationPipe } from '../../common/validation.js';
import { CreateProjectDto } from './createProject.dto.js';
import { UpdateProjectDto } from './updateProject.dto.js';

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
        return err.getEnglishFields() ?? {};
      }
      throw err;
    }
  }

  async function validateUpdate(
    payload: unknown,
  ): Promise<Record<string, string>> {
    try {
      await pipe.transform(payload, { type: 'body', metatype: UpdateProjectDto });
      return {};
    } catch (err) {
      if (err instanceof ApiException) {
        return err.getEnglishFields() ?? {};
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

  describe('name string inputs (B6 rows 3–5) match between DTOs and projectNameProblem', () => {
    it('row 3: empty or whitespace string gives nameRequired', async () => {
      for (const name of ['', '   ']) {
        const createFields = await validateCreate({ ...validBase, name });
        expect(createFields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);

        const updateFields = await validateUpdate({ name });
        expect(updateFields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);

        expect(projectNameProblem(name)).toEqual(
          PROJECT_FIELD_MESSAGE_REFS.nameRequired,
        );
      }
    });

    it('row 4: over-length string (81 chars) gives nameTooLong', async () => {
      const name = 'a'.repeat(81);
      const createFields = await validateCreate({ ...validBase, name });
      expect(createFields.name).toBe(PROJECT_FIELD_MESSAGES.nameTooLong);

      const updateFields = await validateUpdate({ name });
      expect(updateFields.name).toBe(PROJECT_FIELD_MESSAGES.nameTooLong);

      expect(projectNameProblem(name)).toEqual(
        PROJECT_FIELD_MESSAGE_REFS.nameTooLong,
      );
    });

    it('row 5: strings with hidden chars give hiddenChars', async () => {
      for (const name of ['Project \u0000', 'Project \u202E', 'Project \u200B']) {
        const createFields = await validateCreate({ ...validBase, name });
        expect(createFields.name).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);

        const updateFields = await validateUpdate({ name });
        expect(updateFields.name).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);

        expect(projectNameProblem(name)).toEqual(
          PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
        );
      }
    });
  });

  describe('description string inputs (B6 rows 10–11) match between DTOs and projectDescriptionProblem', () => {
    it('row 10: over-length description (2001 chars) gives descriptionTooLong', async () => {
      const description = 'a'.repeat(2001);
      const createFields = await validateCreate({ ...validBase, description });
      expect(createFields.description).toBe(
        PROJECT_FIELD_MESSAGES.descriptionTooLong,
      );

      const updateFields = await validateUpdate({ description });
      expect(updateFields.description).toBe(
        PROJECT_FIELD_MESSAGES.descriptionTooLong,
      );

      expect(projectDescriptionProblem(description)).toEqual(
        PROJECT_FIELD_MESSAGE_REFS.descriptionTooLong,
      );
    });

    it('row 11: description with control chars (NUL, bell) gives hiddenChars', async () => {
      for (const description of ['Desc \u0000', 'Desc \u0007']) {
        const createFields = await validateCreate({ ...validBase, description });
        expect(createFields.description).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);

        const updateFields = await validateUpdate({ description });
        expect(updateFields.description).toBe(PROJECT_FIELD_MESSAGES.hiddenChars);

        expect(projectDescriptionProblem(description)).toEqual(
          PROJECT_FIELD_MESSAGE_REFS.hiddenChars,
        );
      }
    });
  });

  describe('non-string or nested inputs (B6 rows 6, 13, 14, 16) through DTOs', () => {
    it('row 6: invalid name types give nameRequired', async () => {
      for (const name of [123, null, ['a']]) {
        const createFields = await validateCreate({ ...validBase, name });
        expect(createFields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);

        const updateFields = await validateUpdate({ name });
        expect(updateFields.name).toBe(PROJECT_FIELD_MESSAGES.nameRequired);
      }
    });

    it('row 13: invalid description types give descriptionTooLong', async () => {
      for (const description of [null, 5]) {
        const createFields = await validateCreate({ ...validBase, description });
        expect(createFields.description).toBe(
          PROJECT_FIELD_MESSAGES.descriptionTooLong,
        );

        const updateFields = await validateUpdate({ description });
        expect(updateFields.description).toBe(
          PROJECT_FIELD_MESSAGES.descriptionTooLong,
        );
      }
    });

    it('row 14: invalid icon shapes give iconRequired', async () => {
      for (const icon of [null, [], 'star']) {
        const createFields = await validateCreate({ ...validBase, icon });
        expect(createFields.icon).toBe(PROJECT_FIELD_MESSAGES.iconRequired);

        const updateFields = await validateUpdate({ icon });
        expect(updateFields.icon).toBe(PROJECT_FIELD_MESSAGES.iconRequired);
      }
    });

    it('row 15: unknown icon name gives iconRequired on icon.name', async () => {
      const createFields = await validateCreate({
        ...validBase,
        icon: { name: 'nope', color: '#FFFFFF' },
      });
      expect(createFields['icon.name']).toBe(PROJECT_FIELD_MESSAGES.iconRequired);

      const updateFields = await validateUpdate({
        icon: { name: 'nope', color: '#FFFFFF' },
      });
      expect(updateFields['icon.name']).toBe(PROJECT_FIELD_MESSAGES.iconRequired);
    });

    it('row 16: invalid icon color gives iconColorInvalid', async () => {
      const createInvalid = await validateCreate({
        ...validBase,
        icon: { name: 'star', color: 'red' },
      });
      expect(createInvalid['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );

      const updateInvalid = await validateUpdate({
        icon: { name: 'star', color: 'red' },
      });
      expect(updateInvalid['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );

      const createMissing = await validateCreate({
        ...validBase,
        icon: { name: 'star' },
      });
      expect(createMissing['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );

      const updateMissing = await validateUpdate({
        icon: { name: 'star' },
      });
      expect(updateMissing['icon.color']).toBe(
        PROJECT_FIELD_MESSAGES.iconColorInvalid,
      );
    });

    it('row 18: invalid coverKey gives coverRequired', async () => {
      for (const coverKey of ['cover-99', null]) {
        const createFields = await validateCreate({ ...validBase, coverKey });
        expect(createFields.coverKey).toBe(PROJECT_FIELD_MESSAGES.coverRequired);

        const updateFields = await validateUpdate({ coverKey });
        expect(updateFields.coverKey).toBe(PROJECT_FIELD_MESSAGES.coverRequired);
      }
    });

    it('row 19 & 20: timezone validation on UpdateProjectDto', async () => {
      for (const timezone of ['', 'utc', 'Mars/Base', 5, []]) {
        const fields = await validateUpdate({ timezone });
        expect(fields.timezone).toBe(TIMEZONE_MESSAGES.invalid);
      }

      const validNull = await validateUpdate({ timezone: null });
      expect(validNull.timezone).toBeUndefined();

      const validTz = await validateUpdate({ timezone: 'Asia/Tokyo' });
      expect(validTz.timezone).toBeUndefined();
    });
  });
});
