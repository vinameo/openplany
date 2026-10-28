import { useState } from "react";
import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  CreateStateRequest,
  StateGroup,
  StateResponse,
  UpdateStateRequest,
} from "@repo/contracts";
import { parseStateError } from "./stateErrors";

export interface ChangeGroupState {
  stateId: string;
  stateName: string;
  targetGroup: StateGroup;
  count: number;
  pendingPatch: UpdateStateRequest;
}

export interface UseStatePageActionsProps {
  states: StateResponse[] | undefined;
  createMutation: {
    mutateAsync: (body: CreateStateRequest) => Promise<unknown>;
  };
  updateMutation: {
    mutateAsync: (args: {
      stateId: string;
      body: UpdateStateRequest;
    }) => Promise<unknown>;
  };
  deleteMutation: {
    mutateAsync: (args: {
      stateId: string;
      replacementStateId?: string;
    }) => Promise<unknown>;
  };
}

export function useStatePageActions({
  states,
  createMutation,
  updateMutation,
  deleteMutation,
}: UseStatePageActionsProps) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [changeGroupState, setChangeGroupState] =
    useState<ChangeGroupState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StateResponse | null>(null);

  const handleCreate = async (body: CreateStateRequest) => {
    setServerError(null);
    setFieldErrors({});
    try {
      await createMutation.mutateAsync(body);
    } catch (err: unknown) {
      const parsed = parseStateError(err, t);
      if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
      if (parsed.message) setServerError(parsed.message);
      throw err;
    }
  };

  const handleUpdate = async (stateId: string, body: UpdateStateRequest) => {
    setServerError(null);
    setFieldErrors({});
    try {
      await updateMutation.mutateAsync({ stateId, body });
    } catch (err: unknown) {
      const parsed = parseStateError(err, t);
      if (parsed.isGroupChangeUnconfirmed) {
        const state = states?.find((s) => s.id === stateId);
        if (state && body.group) {
          setChangeGroupState({
            stateId,
            stateName: state.name,
            targetGroup: body.group,
            count: parsed.unconfirmedCount ?? 0,
            pendingPatch: body,
          });
        }
        throw err;
      }
      if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
      if (parsed.message) setServerError(parsed.message);
      throw err;
    }
  };

  const handleConfirmChangeGroup = async () => {
    if (!changeGroupState) return;
    try {
      await updateMutation.mutateAsync({
        stateId: changeGroupState.stateId,
        body: {
          ...changeGroupState.pendingPatch,
          confirmGroupChange: true,
        },
      });
      setChangeGroupState(null);
    } catch (err: unknown) {
      const parsed = parseStateError(err, t);
      if (parsed.message) setServerError(parsed.message);
    }
  };

  const handleDeleteConfirm = async (
    targetStateId: string,
    replacementStateId?: string,
  ) => {
    await deleteMutation.mutateAsync({
      stateId: targetStateId,
      replacementStateId,
    });
    setDeleteTarget(null);
  };

  const serverAlert = serverError ? (
    <Alert
      color="red"
      role="alert"
      withCloseButton
      onClose={() => setServerError(null)}
    >
      {serverError}
    </Alert>
  ) : null;

  return {
    serverError,
    setServerError,
    fieldErrors,
    changeGroupState,
    setChangeGroupState,
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleUpdate,
    handleConfirmChangeGroup,
    handleDeleteConfirm,
    serverAlert,
  };
}
