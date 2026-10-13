import { Injectable } from '@nestjs/common';
import type { ProjectAccessPolicies } from '@repo/contracts';

/**
 * TEMP until CreateProjectAccessPolicies (ticket 03).
 * Dựng từ chính sách hiện có, chưa có sàn (lowest = vai trò thấp nhất hiện tại).
 */
const WORKSPACE_ROLE_POLICY: ProjectAccessPolicies = {
  admin: {
    workspaceRole: 'admin',
    implicitProjectRole: 'admin',
    lowestAssignableRole: 'admin',
    highestAssignableRole: 'admin',
    overridesProjectRank: true,
  },
  member: {
    workspaceRole: 'member',
    implicitProjectRole: null,
    lowestAssignableRole: 'guest',
    highestAssignableRole: 'admin',
    overridesProjectRank: false,
  },
  guest: {
    workspaceRole: 'guest',
    implicitProjectRole: null,
    lowestAssignableRole: 'guest',
    highestAssignableRole: 'guest',
    overridesProjectRank: false,
  },
};

export abstract class ProjectAccessPolicyStore {
  /**
   * Policies that govern workspace-to-project role inheritance and assignable ranges.
   */
  abstract policies(): ProjectAccessPolicies;
}

/**
 * TEMP until CreateProjectAccessPolicies (ticket 03).
 */
@Injectable()
export class TempProjectAccessPolicyStore extends ProjectAccessPolicyStore {
  policies(): ProjectAccessPolicies {
    return WORKSPACE_ROLE_POLICY;
  }
}
