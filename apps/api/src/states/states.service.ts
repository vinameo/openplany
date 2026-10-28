import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  INITIAL_STATE_KEY,
  PROJECT_STATES_MAX,
  WORKSPACE_STATES_MAX,
  type StateListResponse,
  type StateMutationResponse,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { CreateStateDto } from './dto/createState.dto.js';
import { toStateResponse } from './dto/stateResponse.js';
import type { UpdateStateDto } from './dto/updateState.dto.js';
import { StateEvents } from './stateEvents.js';
import { StateCatalog, type StateScope } from './stateCatalog.js';
import { StatesRepository } from './repositories/states.repository.js';

export interface ListProjectStatesInput {
  workspaceId: string;
  projectId: string;
  canManage: boolean;
}

export interface CreateStateInput {
  scope: StateScope;
  actorId: string;
  dto: CreateStateDto;
  requestId?: string;
}

export interface UpdateStateInput {
  scope: StateScope;
  actorId: string;
  stateId: string;
  dto: UpdateStateDto;
  requestId?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class StatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: StateCatalog,
    private readonly repository: StatesRepository,
    private readonly events: StateEvents,
    private readonly clock: Clock,
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

  async create(input: CreateStateInput): Promise<StateMutationResponse> {
    const now = this.clock.now();
    const result = await this.repository.create({
      scope: input.scope,
      actorId: input.actorId,
      name: input.dto.name,
      group: input.dto.group,
      color: input.dto.color,
      now,
    });

    switch (result.status) {
      case 'created':
        this.events.created({
          workspaceId: input.scope.workspaceId,
          projectId:
            input.scope.level === 'project' ? input.scope.projectId : undefined,
          stateId: result.state.id,
          level: result.state.level,
          group: result.state.group,
          actorId: input.actorId,
          requestId: input.requestId,
        });
        return {
          state: toStateResponse(result.state, 0),
        };

      case 'workspace_gone':
        throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', {
          key: 'errors:http.notFound',
        });

      case 'project_gone':
        throw new ApiException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', {
          key: 'project:errors.notFound',
        });

      case 'forbidden':
        throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
          key: 'errors:forbidden',
        });

      case 'actor_inactive':
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });

      case 'limit_reached':
        if (input.scope.level === 'workspace') {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'WORKSPACE_STATE_LIMIT_REACHED',
            {
              key: 'state:errors.workspaceLimitReached',
              params: { max: WORKSPACE_STATES_MAX },
            },
          );
        }
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_STATE_LIMIT_REACHED',
          {
            key: 'state:errors.projectLimitReached',
            params: { max: PROJECT_STATES_MAX },
          },
        );

      case 'name_taken':
        throw new ApiException(
          HttpStatus.CONFLICT,
          'STATE_NAME_TAKEN',
          { key: 'state:errors.nameTaken' },
          { fields: { name: { key: 'state:errors.nameTaken' } } },
        );

      case 'name_taken_in_projects':
        throw new ApiException(
          HttpStatus.CONFLICT,
          'STATE_NAME_TAKEN_IN_PROJECTS',
          {
            key: 'state:errors.nameTakenInProjects',
            params: { count: result.count },
          },
          {
            count: result.count,
            fields: {
              name: {
                key: 'state:errors.nameTakenInProjects',
                params: { count: result.count },
              },
            },
          },
        );
    }
  }

  async update(input: UpdateStateInput): Promise<StateMutationResponse> {
    if (!UUID_REGEX.test(input.stateId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'STATE_NOT_FOUND', {
        key: 'state:errors.notFound',
      });
    }

    const now = this.clock.now();
    const result = await this.repository.update({
      scope: input.scope,
      actorId: input.actorId,
      stateId: input.stateId,
      name: input.dto.name,
      group: input.dto.group,
      color: input.dto.color,
      confirmGroupChange: input.dto.confirmGroupChange,
      now,
    });

    switch (result.status) {
      case 'updated':
        this.events.updated({
          workspaceId: input.scope.workspaceId,
          projectId:
            input.scope.level === 'project' ? input.scope.projectId : undefined,
          stateId: result.state.id,
          level: result.state.level,
          group: result.state.group,
          actorId: input.actorId,
          changed: result.changed,
          requestId: input.requestId,
        });
        return {
          state: toStateResponse(result.state, result.count),
        };

      case 'workspace_gone':
        throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', {
          key: 'errors:http.notFound',
        });

      case 'project_gone':
        throw new ApiException(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', {
          key: 'project:errors.notFound',
        });

      case 'forbidden':
        throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', {
          key: 'errors:forbidden',
        });

      case 'actor_inactive':
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });

      case 'not_found':
        throw new ApiException(HttpStatus.NOT_FOUND, 'STATE_NOT_FOUND', {
          key: 'state:errors.notFound',
        });

      case 'name_taken':
        throw new ApiException(
          HttpStatus.CONFLICT,
          'STATE_NAME_TAKEN',
          { key: 'state:errors.nameTaken' },
          { fields: { name: { key: 'state:errors.nameTaken' } } },
        );

      case 'name_taken_in_projects':
        throw new ApiException(
          HttpStatus.CONFLICT,
          'STATE_NAME_TAKEN_IN_PROJECTS',
          {
            key: 'state:errors.nameTakenInProjects',
            params: { count: result.count },
          },
          {
            count: result.count,
            fields: {
              name: {
                key: 'state:errors.nameTakenInProjects',
                params: { count: result.count },
              },
            },
          },
        );

      case 'group_change_unconfirmed':
        throw new ApiException(
          HttpStatus.CONFLICT,
          'STATE_GROUP_CHANGE_UNCONFIRMED',
          {
            key: 'state:errors.groupChangeUnconfirmed',
            params: { count: result.count },
          },
          { count: result.count },
        );
    }
  }
}
