import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  INITIAL_STATE_KEY,
  PROJECT_STATES_MAX,
  type StateListResponse,
} from '@repo/contracts';
import { toStateResponse } from './dto/stateResponse.js';
import { StateCatalog } from './stateCatalog.js';

export interface ListProjectStatesInput {
  workspaceId: string;
  projectId: string;
  canManage: boolean;
}

@Injectable()
export class StatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: StateCatalog,
  ) {}

  async listForProject(
    input: ListProjectStatesInput,
  ): Promise<StateListResponse> {
    const states = await this.catalog.effectiveFor(this.dataSource.manager, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });

    const initialState =
      states.find(
        (s) => s.level === 'default' && s.defaultKey === INITIAL_STATE_KEY,
      ) ?? states[0];

    const ownCount = states.filter((s) => s.level === 'project').length;

    let counts: Map<string, number> | undefined;
    if (input.canManage && states.length > 0) {
      counts = await this.catalog.workItemCounts(this.dataSource.manager, {
        stateIds: states.map((s) => s.id),
        scope: {
          level: 'project',
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
      });
    }

    return {
      states: states.map((s) =>
        toStateResponse(s, counts ? (counts.get(s.id) ?? 0) : undefined),
      ),
      ownCount,
      ownMax: PROJECT_STATES_MAX,
      initialStateId: initialState ? initialState.id : '',
    };
  }
}
