import type { MessageRef } from './catalog/types.js';
import { NO_HIDDEN_CHARS } from './workspace.js';

export const STATE_GROUPS = [
  'backlog',
  'planned',
  'active',
  'finished',
  'cancelled',
] as const;
export type StateGroup = (typeof STATE_GROUPS)[number];

export const STATE_LEVELS = ['default', 'workspace', 'project'] as const;
export type StateLevel = (typeof STATE_LEVELS)[number];

export const DEFAULT_STATE_KEYS = [
  'backlog',
  'todo',
  'in_progress',
  'done',
  'cancelled',
] as const;
export type DefaultStateKey = (typeof DEFAULT_STATE_KEYS)[number];

export const INITIAL_STATE_KEY = 'backlog';

export const STATE_NAME_MAX = 40;
export const WORKSPACE_STATES_MAX = 50;
export const PROJECT_STATES_MAX = 50;

export const STATE_COLORS = [
  '#8E98A8',
  '#5B6B82',
  '#E08A1E',
  '#2F9E6E',
  '#B05A5A',
  '#3E7BD6',
  '#7A5CC7',
  '#C2508E',
  '#1F9AAE',
  '#7FA33A',
  '#D0642B',
  '#4B5563',
] as const;
export type StateColor = (typeof STATE_COLORS)[number];
export const DEFAULT_STATE_COLOR: StateColor = STATE_COLORS[0];

export const STATE_ERROR_CODES = {
  NOT_FOUND: 'STATE_NOT_FOUND',
  NAME_TAKEN: 'STATE_NAME_TAKEN',
  NAME_TAKEN_IN_PROJECTS: 'STATE_NAME_TAKEN_IN_PROJECTS',
  WORKSPACE_LIMIT_REACHED: 'WORKSPACE_STATE_LIMIT_REACHED',
  PROJECT_LIMIT_REACHED: 'PROJECT_STATE_LIMIT_REACHED',
  REPLACEMENT_REQUIRED: 'STATE_REPLACEMENT_REQUIRED',
  REPLACEMENT_INVALID: 'STATE_REPLACEMENT_INVALID',
  UNAVAILABLE: 'STATE_UNAVAILABLE',
  GROUP_CHANGE_UNCONFIRMED: 'STATE_GROUP_CHANGE_UNCONFIRMED',
} as const;

export function normalizeStateName(raw: string): string {
  return raw.normalize('NFC').trim();
}

export function stateNameProblem(raw: string): MessageRef | null {
  const normalized = normalizeStateName(raw);
  if (!normalized) {
    return { key: 'state:errors.nameRequired' };
  }
  if (normalized.length > STATE_NAME_MAX) {
    return {
      key: 'state:errors.nameTooLong',
      params: { max: STATE_NAME_MAX },
    };
  }
  if (!NO_HIDDEN_CHARS.test(normalized)) {
    return { key: 'state:errors.nameHiddenChars' };
  }
  return null;
}

export interface StateResponse {
  id: string;
  name: string;
  group: StateGroup;
  color: string;
  level: StateLevel;
  workItemCount?: number;
}

export interface StateListResponse {
  states: StateResponse[];
  ownCount: number;
  ownMax: number;
  initialStateId: string;
}

export interface CreateStateRequest {
  name: string;
  group: StateGroup;
  color: string;
}

export interface UpdateStateRequest {
  name?: string;
  group?: StateGroup;
  color?: string;
  confirmGroupChange?: boolean;
}

export interface StateMutationResponse {
  state: StateResponse;
}
