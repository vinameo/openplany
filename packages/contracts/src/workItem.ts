import type { MessageRef } from './catalog/index.js';
import { MULTILINE_TEXT_ALLOWED_CHARS } from './project.js';
import { NO_HIDDEN_CHARS } from './workspace.js';

export const WORK_ITEM_TITLE_MIN_LENGTH = 1;
export const WORK_ITEM_TITLE_MAX_LENGTH = 255;
export const WORK_ITEM_DESCRIPTION_MAX_LENGTH = 50000;

export const WORK_ITEM_ERROR_CODES = {
  REQUEST_REUSED: 'WORK_ITEM_REQUEST_REUSED',
} as const;

export interface CreateWorkItemRequest {
  title: string;
  description?: string;
  idempotencyKey: string;
  stateId?: string;
}

export interface WorkItemResponse {
  id: string;
  number: number;
  key: string;
  title: string;
  description: string;
  stateId: string;
  createdById: string | null;
  createdAt: string;
}

export interface CreateWorkItemResponse {
  workItem: WorkItemResponse;
}

export function workItemKey(projectIdentifier: string, number: number): string {
  return `${projectIdentifier}-${number}`;
}

export function normalizeWorkItemTitle(raw: string): string {
  return raw.normalize('NFC').trim();
}

export function normalizeWorkItemDescription(raw: string): string {
  const lf = raw.replace(/\r\n|\r/g, '\n');
  if (lf.trim().length === 0) {
    return '';
  }
  return lf;
}

export function workItemTitleProblem(title: string): MessageRef | null {
  const normalized = normalizeWorkItemTitle(title);
  if (!normalized) {
    return { key: 'workItem:errors.titleRequired' };
  }
  if (normalized.length > WORK_ITEM_TITLE_MAX_LENGTH) {
    return {
      key: 'workItem:errors.titleTooLong',
      params: { max: WORK_ITEM_TITLE_MAX_LENGTH },
    };
  }
  if (!NO_HIDDEN_CHARS.test(normalized)) {
    return { key: 'workItem:errors.titleHiddenChars' };
  }
  return null;
}

export function workItemDescriptionProblem(
  description: string,
): MessageRef | null {
  if (!description) {
    return null;
  }
  if (description.length > WORK_ITEM_DESCRIPTION_MAX_LENGTH) {
    return {
      key: 'workItem:errors.descriptionTooLong',
      params: { max: WORK_ITEM_DESCRIPTION_MAX_LENGTH },
    };
  }
  if (!MULTILINE_TEXT_ALLOWED_CHARS.test(description)) {
    return { key: 'workItem:errors.descriptionHiddenChars' };
  }
  return null;
}

