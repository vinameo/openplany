import { Injectable, Logger } from '@nestjs/common';
import { WorkItemEvents } from './workItemEvents.js';

@Injectable()
export class LoggingWorkItemEvents implements WorkItemEvents {
  private readonly logger = new Logger('WorkItems');

  onWorkItemCreated(data: {
    workItemId: string;
    projectId: string;
    workspaceId: string;
    actorId: string;
    number: number;
    requestId?: string;
  }): void {
    const reqStr = data.requestId ? ` requestId=${data.requestId}` : '';
    this.logger.log(
      `work_item.created workItemId=${data.workItemId} projectId=${data.projectId} workspaceId=${data.workspaceId} actorId=${data.actorId} number=${data.number}${reqStr}`,
    );
  }

  onWorkItemReplayed(data: {
    workItemId: string;
    projectId: string;
    actorId: string;
    requestId?: string;
  }): void {
    const reqStr = data.requestId ? ` requestId=${data.requestId}` : '';
    this.logger.log(
      `work_item.create.replayed workItemId=${data.workItemId} projectId=${data.projectId} actorId=${data.actorId}${reqStr}`,
    );
  }

  onWorkItemForbidden(
    projectId: string,
    actorId: string,
    requestId?: string,
  ): void {
    const reqStr = requestId ? ` requestId=${requestId}` : '';
    this.logger.warn(
      `work_item.create.forbidden projectId=${projectId} actorId=${actorId}${reqStr}`,
    );
  }

  onWorkItemKeyReused(
    projectId: string,
    actorId: string,
    requestId?: string,
  ): void {
    const reqStr = requestId ? ` requestId=${requestId}` : '';
    this.logger.warn(
      `work_item.create.key_reused projectId=${projectId} actorId=${actorId}${reqStr}`,
    );
  }

  onTransactionRetry(attempt: number, projectId: string): void {
    this.logger.warn(
      `work_item.create.retry attempt=${attempt} projectId=${projectId}`,
    );
  }
}

