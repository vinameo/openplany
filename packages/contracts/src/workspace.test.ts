import { describe, expect, it } from 'vitest';
import {
  RESERVED_WORKSPACE_SLUGS,
  extractSlugFromUrl,
  normalizeSlugInput,
  pickWorkspaceColor,
  slugify,
  workspaceSlugProblem,
} from './workspace.js';

describe('contracts workspace helpers', () => {
  it('slugify handles regular and Vietnamese names properly (BA 5.2 examples)', () => {
    expect(slugify('OpenPlany Dev Team')).toBe('openplany-dev-team');
    expect(slugify('Công ty Đầu tư Ánh Dương')).toBe('cong-ty-dau-tu-anh-duong');
    expect(slugify('  Acme & Co.  ')).toBe('acme-co');
    expect(slugify('R&D__Team--2026')).toBe('r-d-team-2026');
    expect(slugify('株式会社')).toBe('');
    expect(slugify('🚀🚀')).toBe('');
    expect(slugify('Admin')).toBe('admin');
  });

  it('slugify truncates to 48 characters without trailing hyphens', () => {
    const longName = 'A'.repeat(60);
    const slug = slugify(longName);
    expect(slug.length).toBe(48);
    expect(slug).toBe('a'.repeat(48));

    const edge = `${'a'.repeat(47)} -- ${'b'.repeat(10)}`;
    const edgeSlug = slugify(edge);
    expect(edgeSlug.length).toBeLessThanOrEqual(48);
    expect(edgeSlug.endsWith('-')).toBe(false);
  });

  it('normalizeSlugInput preserves trailing hyphens while sanitizing disallowed characters', () => {
    expect(normalizeSlugInput('Acme-Team-')).toBe('acme-team-');
    expect(normalizeSlugInput('Acme Team')).toBe('acme-team');
    expect(normalizeSlugInput('Đầu Tư')).toBe('dau-tu');
    expect(normalizeSlugInput('acme@corp!#')).toBe('acmecorp');
  });

  it('extractSlugFromUrl retrieves the last segment from pasted URL', () => {
    expect(extractSlugFromUrl('https://app.openplany.dev/acme/')).toBe('acme');
    expect(extractSlugFromUrl('https://app.openplany.dev/acme')).toBe('acme');
    expect(extractSlugFromUrl('acme-team')).toBe('acme-team');
    expect(extractSlugFromUrl('http://localhost:5173/my-org/')).toBe('my-org');
  });

  it('pickWorkspaceColor is deterministic and produces valid hex', () => {
    const id1 = 'e4b2d5a1-7c38-4f9e-912b-3a5e8c1029ab';
    const color1 = pickWorkspaceColor(id1);
    const color2 = pickWorkspaceColor(id1);
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^#[0-9A-F]{6}$/);

    const id2 = '00000000-0000-0000-0000-000000000000';
    expect(pickWorkspaceColor(id2)).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('workspaceSlugProblem detects length, regex, and reserved slugs', () => {
    expect(workspaceSlugProblem('ab')).toBe('INVALID');
    expect(workspaceSlugProblem('-acme')).toBe('INVALID');
    expect(workspaceSlugProblem('acme-')).toBe('INVALID');
    expect(workspaceSlugProblem('acme--team')).toBe('INVALID');
    expect(workspaceSlugProblem('Acme')).toBe('INVALID');
    expect(workspaceSlugProblem('a'.repeat(49))).toBe('INVALID');

    expect(workspaceSlugProblem('admin')).toBe('RESERVED');
    expect(workspaceSlugProblem('slug-check')).toBe('RESERVED');
    expect(workspaceSlugProblem('api')).toBe('RESERVED');
    expect(workspaceSlugProblem('settings')).toBe('RESERVED');
    expect(workspaceSlugProblem('create-workspace')).toBe('RESERVED');

    expect(workspaceSlugProblem('acme')).toBe(null);
    expect(workspaceSlugProblem('acme-corp')).toBe(null);
    expect(workspaceSlugProblem('admin-team')).toBe(null);
  });

  it('RESERVED_WORKSPACE_SLUGS contains essential routes and terms', () => {
    expect(RESERVED_WORKSPACE_SLUGS.has('admin')).toBe(true);
    expect(RESERVED_WORKSPACE_SLUGS.has('slug-check')).toBe(true);
    expect(RESERVED_WORKSPACE_SLUGS.has('create-workspace')).toBe(true);
    expect(RESERVED_WORKSPACE_SLUGS.has('sign-in')).toBe(true);
    expect(RESERVED_WORKSPACE_SLUGS.has('openplany')).toBe(true);
  });
});

