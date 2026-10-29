import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  INITIAL_PRIORITY_KEY,
  type PriorityListResponse,
} from '@repo/contracts';
import { toPriorityResponse } from './dto/priorityResponse.js';
import { PriorityCatalog } from './priorityCatalog.js';

@Injectable()
export class PrioritiesService {
  constructor(
    private readonly catalog: PriorityCatalog,
    private readonly dataSource: DataSource,
  ) {}

  async listForProject(scope: {
    workspaceId: string;
    projectId: string;
  }): Promise<PriorityListResponse> {
    const priorities = await this.catalog.effectiveFor(
      this.dataSource.manager,
      scope,
    );

    const initial = priorities.find(
      (p) => p.level === 'default' && p.defaultKey === INITIAL_PRIORITY_KEY,
    );

    if (!initial) {
      throw new Error(`Initial priority '${INITIAL_PRIORITY_KEY}' not found`);
    }

    return {
      priorities: priorities.map(toPriorityResponse),
      initialPriorityId: initial.id,
    };
  }
}
