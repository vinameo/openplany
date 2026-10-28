import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  STATE_GROUPS,
  type CreateStateRequest,
  type StateListResponse,
  type StateResponse,
  type UpdateStateRequest,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { stateKeys } from "./stateQueries";
import { statesApi } from "./statesApi";

function insertStateIntoList(
  states: StateResponse[],
  target: StateResponse,
): StateResponse[] {
  const targetGroupIndex = STATE_GROUPS.indexOf(target.group);
  let insertIndex = states.length;
  for (let i = 0; i < states.length; i++) {
    const s = states[i]!;
    const gIndex = STATE_GROUPS.indexOf(s.group);
    if (gIndex > targetGroupIndex) {
      insertIndex = i;
      break;
    }
  }
  const result = [...states];
  result.splice(insertIndex, 0, target);
  return result;
}

export function useCreateProjectStateMutation(
  slug: string,
  identifier: string,
) {
  const queryClient = useQueryClient();
  const queryKey = stateKeys.project(slug, identifier);

  return useMutation({
    mutationFn: (body: CreateStateRequest) =>
      statesApi.createProjectState(slug, identifier, body),
    onSuccess: (res) => {
      queryClient.setQueryData<StateListResponse>(queryKey, (old) => {
        if (!old) return old;
        const newStates = insertStateIntoList(old.states, res.state);
        return {
          ...old,
          states: newStates,
          ownCount: old.ownCount + 1,
        };
      });
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.code === "STATE_NAME_TAKEN") {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

export function useUpdateProjectStateMutation(
  slug: string,
  identifier: string,
) {
  const queryClient = useQueryClient();
  const queryKey = stateKeys.project(slug, identifier);

  return useMutation({
    mutationFn: ({
      stateId,
      body,
    }: {
      stateId: string;
      body: UpdateStateRequest;
    }) => statesApi.updateProjectState(slug, identifier, stateId, body),
    onSuccess: (res) => {
      queryClient.setQueryData<StateListResponse>(queryKey, (old) => {
        if (!old) return old;
        const updated = res.state;
        const oldIndex = old.states.findIndex((s) => s.id === updated.id);
        if (oldIndex === -1) return old;
        const oldState = old.states[oldIndex]!;

        if (oldState.group === updated.group) {
          const newStates = [...old.states];
          newStates[oldIndex] = updated;
          return { ...old, states: newStates };
        }

        const filtered = old.states.filter((s) => s.id !== updated.id);
        const newStates = insertStateIntoList(filtered, updated);
        return { ...old, states: newStates };
      });
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.code === "STATE_NAME_TAKEN") {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
