import type { StateResponse } from "@repo/contracts";
import { ChangeStateGroupModal } from "./ChangeStateGroupModal";
import { DeleteStateModal } from "./DeleteStateModal";
import type { ChangeGroupState } from "./useStatePageActions";

export interface StateModalsProps {
  changeGroupState: ChangeGroupState | null;
  deleteTarget: StateResponse | null;
  availableStates: StateResponse[];
  isUpdating: boolean;
  isDeleting: boolean;
  onConfirmChangeGroup: () => Promise<void>;
  onCancelChangeGroup: () => void;
  onConfirmDelete: (
    targetStateId: string,
    replacementStateId?: string,
  ) => Promise<void>;
  onCancelDelete: () => void;
  onRefetch: () => Promise<void>;
  onNotFound: (message: string) => void;
}

export function StateModals({
  changeGroupState,
  deleteTarget,
  availableStates,
  isUpdating,
  isDeleting,
  onConfirmChangeGroup,
  onCancelChangeGroup,
  onConfirmDelete,
  onCancelDelete,
  onRefetch,
  onNotFound,
}: StateModalsProps) {
  return (
    <>
      <ChangeStateGroupModal
        opened={changeGroupState !== null}
        stateName={changeGroupState?.stateName ?? ""}
        targetGroup={changeGroupState?.targetGroup ?? "backlog"}
        count={changeGroupState?.count ?? 0}
        isPending={isUpdating}
        onConfirm={onConfirmChangeGroup}
        onCancel={onCancelChangeGroup}
      />

      <DeleteStateModal
        opened={deleteTarget !== null}
        targetState={deleteTarget}
        availableStates={availableStates}
        isPending={isDeleting}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        onRefetch={onRefetch}
        onNotFound={onNotFound}
      />
    </>
  );
}
