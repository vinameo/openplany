import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateWorkItemRequest,
  CreateWorkItemResponse,
} from "@repo/contracts";
import { addWorkItemToStateCounts } from "../../states/api/stateQueries";
import { workItemsApi } from "./workItemsApi";

export interface CreateWorkItemVariables {
  slug: string;
  identifier: string;
  body: CreateWorkItemRequest;
}

export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  return useMutation<CreateWorkItemResponse, Error, CreateWorkItemVariables>({
    mutationFn: ({ slug, identifier, body }) =>
      workItemsApi.create(slug, identifier, body),
    onSuccess: (res, { slug, identifier }) => {
      addWorkItemToStateCounts(
        queryClient,
        slug,
        identifier,
        res.workItem.stateId,
      );
    },
  });
}
