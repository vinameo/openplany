import { describe, expect, it } from 'vitest';
import {
  EDITABLE_WORKSPACE_FIELDS,
  normalizeWorkspaceName,
  pickChangedFields,
  WORKSPACE_NAME_MESSAGES,
  workspaceNameProblem,
} from './workspaceSettings.js';

describe('workspaceSettings', () => {
  describe('normalizeWorkspaceName', () => {
    it('trims whitespace and normalizes Vietnamese text from NFD to NFC', () => {
      // "Tiếng Việt" in decomposed NFD form:
      const nfdText = '  Tie\u0302\u0301ng Vie\u0302\u0323t  ';
      const normalized = normalizeWorkspaceName(nfdText);
      expect(normalized).toBe('Tiếng Việt');
      expect(normalized).toBe(normalized.normalize('NFC'));
    });
  });

  describe('workspaceNameProblem', () => {
    it('returns required message when empty or whitespace-only', () => {
      expect(workspaceNameProblem('')).toBe(WORKSPACE_NAME_MESSAGES.required);
      expect(workspaceNameProblem('   ')).toBe(WORKSPACE_NAME_MESSAGES.required);
    });

    it('returns tooLong message when over 80 characters', () => {
      const longName = 'a'.repeat(81);
      expect(workspaceNameProblem(longName)).toBe(WORKSPACE_NAME_MESSAGES.tooLong);
    });

    it('returns hiddenChars message when containing hidden control/format characters', () => {
      const withControl = 'Open\u0000Plany';
      expect(workspaceNameProblem(withControl)).toBe(
        WORKSPACE_NAME_MESSAGES.hiddenChars,
      );

      const withFormat = 'Open\u200BPlany'; // zero-width space
      expect(workspaceNameProblem(withFormat)).toBe(
        WORKSPACE_NAME_MESSAGES.hiddenChars,
      );
    });

    it('returns url message when containing URL schemes or starting with www.', () => {
      expect(workspaceNameProblem('https://openplany.com')).toBe(
        WORKSPACE_NAME_MESSAGES.url,
      );
      expect(workspaceNameProblem('ftp://files.example')).toBe(
        WORKSPACE_NAME_MESSAGES.url,
      );
      expect(workspaceNameProblem('www.openplany.com')).toBe(
        WORKSPACE_NAME_MESSAGES.url,
      );
    });

    it('returns null for valid workspace names', () => {
      expect(workspaceNameProblem('OpenPlany Dev Team')).toBeNull();
      expect(workspaceNameProblem('Công ty Đầu tư Ánh Dương')).toBeNull();
      expect(workspaceNameProblem('Acme & Sons (2026)')).toBeNull();
    });
  });

  describe('pickChangedFields', () => {
    it('returns only fields that changed, ignoring equal values and keys outside allowed list', () => {
      const current = {
        name: 'Old Name',
        organizationSize: '2-10' as const,
        timezone: 'UTC',
        extraField: 'ignore-me',
      };

      const next = {
        name: 'New Name',
        organizationSize: '2-10' as const, // unchanged
        timezone: 'Asia/Ho_Chi_Minh',
        extraField: 'something-else', // not in allowed keys
      };

      const changes = pickChangedFields(
        current,
        next,
        EDITABLE_WORKSPACE_FIELDS,
      );

      expect(changes).toEqual({
        name: 'New Name',
        timezone: 'Asia/Ho_Chi_Minh',
      });
      expect(changes).not.toHaveProperty('organizationSize');
      expect(changes).not.toHaveProperty('extraField');
    });

    it('returns empty object when no values changed', () => {
      const current = {
        name: 'Same Name',
        organizationSize: '2-10' as const,
        timezone: 'UTC',
      };

      const changes = pickChangedFields(
        current,
        { name: 'Same Name', timezone: 'UTC' },
        EDITABLE_WORKSPACE_FIELDS,
      );

      expect(changes).toEqual({});
    });
  });
});

