import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type {
  ProjectAccessPolicies,
  ProjectAccessPolicy,
  ProjectRole,
  WorkspaceRole,
} from '@repo/contracts';
import { validateProjectAccessPolicies } from '@repo/contracts';
import { ProjectAccessPolicyEntity } from './entities/projectAccessPolicy.entity.js';

export abstract class ProjectAccessPolicyStore {
  /**
   * Policies that govern workspace-to-project role inheritance and assignable ranges.
   * Calling before bootstrap finishes is a programmer error (throw).
   */
  abstract policies(): ProjectAccessPolicies;
}

@Injectable()
export class TypeOrmProjectAccessPolicyStore
  extends ProjectAccessPolicyStore
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger('ProjectAccessPolicies');
  private loaded: ProjectAccessPolicies | null = null;

  constructor(
    @InjectRepository(ProjectAccessPolicyEntity)
    private readonly repo: Repository<ProjectAccessPolicyEntity>,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    const rows = await this.repo.find();
    const mapped: ProjectAccessPolicy[] = rows.map((row) => ({
      workspaceRole: row.workspaceRole as WorkspaceRole,
      implicitProjectRole: (row.implicitProjectRole ??
        null) as ProjectRole | null,
      lowestAssignableRole: row.lowestAssignableRole as ProjectRole,
      highestAssignableRole: row.highestAssignableRole as ProjectRole,
      overridesProjectRank: Boolean(row.overridesProjectRank),
    }));

    const problem = validateProjectAccessPolicies(mapped);
    if (problem !== null) {
      this.logger.error(`project_access_policies.invalid reason=${problem}`);
      throw new Error(`Invalid project_access_policies: ${problem}`);
    }

    const record = {} as Record<WorkspaceRole, ProjectAccessPolicy>;
    for (const policy of mapped) {
      record[policy.workspaceRole] = policy;
    }
    this.loaded = Object.freeze(record);
  }

  policies(): ProjectAccessPolicies {
    if (this.loaded === null) {
      throw new Error('ProjectAccessPolicyStore used before bootstrap');
    }
    return this.loaded;
  }
}
