import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_ROLE_PERMISSIONS,
  workspacePermissionsOf,
} from './workspacePermissions.js';

describe('workspacePermissions', () => {
  it('defines workspace.settings.update as a recognized permission', () => {
    expect(WORKSPACE_PERMISSIONS).toContain('workspace.settings.update');
  });

  it('grants workspace.settings.update to owner and admin, but not member or guest', () => {
    expect(workspacePermissionsOf('owner')).toEqual(['workspace.settings.update']);
    expect(workspacePermissionsOf('admin')).toEqual(['workspace.settings.update']);
    expect(workspacePermissionsOf('member')).toEqual([]);
    expect(workspacePermissionsOf('guest')).toEqual([]);
  });

  it('returns a new array copy from workspacePermissionsOf so mutations do not affect constant', () => {
    const permissions1 = workspacePermissionsOf('owner');
    permissions1.push('workspace.settings.update' as any);
    expect(permissions1.length).toBe(2);

    const permissions2 = workspacePermissionsOf('owner');
    expect(permissions2.length).toBe(1);
    expect(WORKSPACE_ROLE_PERMISSIONS.owner.length).toBe(1);
  });
});

