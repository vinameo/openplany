import type { ProjectAccessPolicies } from '@repo/contracts';
import { DEFAULT_PROJECT_ACCESS_POLICIES } from '@repo/contracts/testing';
import { ProjectAccessPolicyStore } from '../../src/roles/projectAccessPolicyStore.js';

export class FakeProjectAccessPolicyStore extends ProjectAccessPolicyStore {
  private currentPolicies: ProjectAccessPolicies;

  constructor(policies?: ProjectAccessPolicies) {
    super();
    this.currentPolicies = policies ?? DEFAULT_PROJECT_ACCESS_POLICIES;
  }

  policies(): ProjectAccessPolicies {
    return this.currentPolicies;
  }

  setPolicies(policies: ProjectAccessPolicies): void {
    this.currentPolicies = policies;
  }
}
