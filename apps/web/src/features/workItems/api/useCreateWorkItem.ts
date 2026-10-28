import { useMutation } from "@tanstack/react-query";
import type {
  CreateWorkItemRequest,
  CreateWorkItemResponse,
} from "@repo/contracts";
import { workItemsApi } from "./workItemsApi";

export interface CreateWorkItemVariables {
  slug: string;
  identifier: string;
  body: CreateWorkItemRequest;
}

export function useCreateWorkItem() {
  return useMutation<CreateWorkItemResponse, Error, CreateWorkItemVariables>({
    mutationFn: ({ slug, identifier, body }) =>
      workItemsApi.create(slug, identifier, body),
  });
}

