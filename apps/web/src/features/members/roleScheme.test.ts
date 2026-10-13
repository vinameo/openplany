import { describe, expect, it } from 'vitest';
import {
  highestRole,
  isTopRole,
  PROJECT_ROLE_SCHEME,
  sortRolesAscending,
  WORKSPACE_ROLE_SCHEME,
} from './roleScheme.js';

describe('roleScheme (WEB B3.1)', () => {
  describe('WORKSPACE_ROLE_SCHEME', () => {
    it('sorts roles in ascending rank order (guest -> member -> admin)', () => {
      expect(
        sortRolesAscending(WORKSPACE_ROLE_SCHEME, ['admin', 'guest', 'member']),
      ).toEqual(['guest', 'member', 'admin']);
    });

    it('identifies highestRole correctly', () => {
      expect(highestRole(WORKSPACE_ROLE_SCHEME, [])).toBeNull();
      expect(highestRole(WORKSPACE_ROLE_SCHEME, ['guest'])).toBe('guest');
      expect(highestRole(WORKSPACE_ROLE_SCHEME, ['guest', 'member'])).toBe(
        'member',
      );
      expect(
        highestRole(WORKSPACE_ROLE_SCHEME, ['guest', 'admin', 'member']),
      ).toBe('admin');
    });

    it('identifies isTopRole correctly', () => {
      expect(isTopRole(WORKSPACE_ROLE_SCHEME, 'admin')).toBe(true);
      expect(isTopRole(WORKSPACE_ROLE_SCHEME, 'member')).toBe(false);
      expect(isTopRole(WORKSPACE_ROLE_SCHEME, 'guest')).toBe(false);
    });
  });

  describe('PROJECT_ROLE_SCHEME', () => {
    it('sorts roles in ascending rank order (guest -> commenter -> contributor -> admin)', () => {
      expect(
        sortRolesAscending(PROJECT_ROLE_SCHEME, [
          'admin',
          'guest',
          'contributor',
          'commenter',
        ]),
      ).toEqual(['guest', 'commenter', 'contributor', 'admin']);
    });

    it('identifies highestRole correctly', () => {
      expect(highestRole(PROJECT_ROLE_SCHEME, [])).toBeNull();
      expect(highestRole(PROJECT_ROLE_SCHEME, ['guest', 'commenter'])).toBe(
        'commenter',
      );
      expect(
        highestRole(PROJECT_ROLE_SCHEME, ['guest', 'contributor', 'commenter']),
      ).toBe('contributor');
      expect(
        highestRole(PROJECT_ROLE_SCHEME, [
          'contributor',
          'admin',
          'commenter',
        ]),
      ).toBe('admin');
    });

    it('identifies isTopRole correctly', () => {
      expect(isTopRole(PROJECT_ROLE_SCHEME, 'admin')).toBe(true);
      expect(isTopRole(PROJECT_ROLE_SCHEME, 'contributor')).toBe(false);
      expect(isTopRole(PROJECT_ROLE_SCHEME, 'commenter')).toBe(false);
      expect(isTopRole(PROJECT_ROLE_SCHEME, 'guest')).toBe(false);
    });
  });
});
