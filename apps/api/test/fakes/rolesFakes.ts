import type { ProjectAccessPolicies } from '@repo/contracts';
import {
  ProjectAccessPolicyStore,
  TempProjectAccessPolicyStore,
} from '../../src/roles/projectAccessPolicyStore.js';

export class FakeProjectAccessPolicyStore extends ProjectAccessPolicyStore {
  private currentPolicies: ProjectAccessPolicies;

  constructor(policies?: ProjectAccessPolicies) {
    super();
    this.currentPolicies =
      policies ?? new TempProjectAccessPolicyStore().policies();
  }

  policies(): ProjectAccessPolicies {
    return this.currentPolicies;
  }

  setPolicies(policies: ProjectAccessPolicies): void {
    this.currentPolicies = policies;
  }
}
