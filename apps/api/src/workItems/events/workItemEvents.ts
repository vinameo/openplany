export abstract class WorkItemEvents {
  abstract onWorkItemCreated(data: {
    workItemId: string;
    projectId: string;
    workspaceId: string;
    actorId: string;
    number: number;
    requestId?: string;
  }): void;

  abstract onWorkItemReplayed(data: {
    workItemId: string;
    projectId: string;
    actorId: string;
    requestId?: string;
  }): void;

  abstract onWorkItemForbidden(
    projectId: string,
    actorId: string,
    requestId?: string,
  ): void;

  abstract onWorkItemKeyReused(
    projectId: string,
    actorId: string,
    requestId?: string,
  ): void;

  abstract onTransactionRetry(attempt: number, projectId: string): void;
}
