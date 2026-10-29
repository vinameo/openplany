import { useRef, useState } from "react";
import { Alert } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  CreateStateRequest,
  StateGroup,
  StateResponse,
  UpdateStateRequest,
} from "@repo/contracts";
import { ApiRequestError } from "../../lib/apiClient";
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

/**
 * Create and update resolve to `true` when the change is saved (the row form
 * closes) and `false` when it is not (the form stays open; the reason is
 * already shown as a field error or the page alert). They never reject.
 */
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
  // Settles the update that opened the change-group modal once it closes
  const settleGroupChangeRef = useRef<((saved: boolean) => void) | null>(null);

  const clearErrors = () => {
    setServerError(null);
    setFieldErrors({});
  };

  const showError = (err: unknown) => {
    const parsed = parseStateError(err, t);
    if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
    if (parsed.message) setServerError(parsed.message);
    if (!(err instanceof ApiRequestError)) {
      console.error("state.write_failed", err);
    }
  };

  const closeChangeGroup = (saved: boolean) => {
    const settle = settleGroupChangeRef.current;
    settleGroupChangeRef.current = null;
    setChangeGroupState(null);
    settle?.(saved);
  };

  const handleCreate = async (body: CreateStateRequest): Promise<boolean> => {
    clearErrors();
    try {
      await createMutation.mutateAsync(body);
      return true;
    } catch (err: unknown) {
      showError(err);
      return false;
    }
  };

  const handleUpdate = async (
    stateId: string,
    body: UpdateStateRequest,
  ): Promise<boolean> => {
    clearErrors();
    try {
      await updateMutation.mutateAsync({ stateId, body });
      return true;
    } catch (err: unknown) {
      const parsed = parseStateError(err, t);
      const state = states?.find((s) => s.id === stateId);
      const targetGroup = body.group;
      if (!parsed.isGroupChangeUnconfirmed || !state || !targetGroup) {
        showError(err);
        return false;
      }
      // The form waits for the modal: confirm saves and closes it, cancel keeps it open
      return new Promise<boolean>((resolve) => {
        settleGroupChangeRef.current = resolve;
        setChangeGroupState({
          stateId,
          stateName: state.name,
          targetGroup,
          count: parsed.unconfirmedCount ?? 0,
          pendingPatch: body,
        });
      });
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
      closeChangeGroup(true);
    } catch (err: unknown) {
      // Back to the form, which shows the reason (e.g. the name was taken meanwhile)
      showError(err);
      closeChangeGroup(false);
    }
  };

  const handleCancelChangeGroup = () => closeChangeGroup(false);

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
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleUpdate,
    handleConfirmChangeGroup,
    handleCancelChangeGroup,
    handleDeleteConfirm,
    serverAlert,
  };
}
