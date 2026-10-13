import { describe, expect, it } from 'vitest';
import { TempProjectAccessPolicyStore } from './projectAccessPolicyStore.js';

describe('TempProjectAccessPolicyStore', () => {
  it('returns valid policies for all workspace roles', () => {
    const store = new TempProjectAccessPolicyStore();
    const policies = store.policies();
    expect(policies.admin.implicitProjectRole).toBe('admin');
    expect(policies.admin.highestAssignableRole).toBe('admin');
    expect(policies.member.implicitProjectRole).toBeNull();
    expect(policies.member.lowestAssignableRole).toBe('viewer');
    expect(policies.member.highestAssignableRole).toBe('admin');
    expect(policies.guest.implicitProjectRole).toBeNull();
    expect(policies.guest.lowestAssignableRole).toBe('viewer');
    expect(policies.guest.highestAssignableRole).toBe('viewer');
  });
});
