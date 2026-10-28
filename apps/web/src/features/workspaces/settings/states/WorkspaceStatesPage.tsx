import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../../../hooks/useDocumentTitle";
import { SettingsSectionFrame } from "../../../settings/SettingsSectionFrame";
import { StatesIcon } from "../../icons";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { useWorkspaceStatesQuery } from "../../../states/api/stateQueries";
import {
  useCreateWorkspaceStateMutation,
  useDeleteWorkspaceStateMutation,
  useUpdateWorkspaceStateMutation,
} from "../../../states/api/useStateMutations";
import { StateList } from "../../../states/list/StateList";
import { useStatePageActions } from "../../../states/useStatePageActions";
import { StateModals } from "../../../states/StateModals";

export function WorkspaceStatesPage() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();

  const canView = workspace.permissions.includes("workspace.settings.view");
  const canManage = workspace.permissions.includes("workspace.states.manage");

  const statesQuery = useWorkspaceStatesQuery(workspace.slug, canView);

  const createMutation = useCreateWorkspaceStateMutation(workspace.slug);
  const updateMutation = useUpdateWorkspaceStateMutation(workspace.slug);
  const deleteMutation = useDeleteWorkspaceStateMutation(workspace.slug);

  const sectionLabel = t("workspace:settings.sections.states");

  useDocumentTitle(
    t("workspace:settings.documentTitle", {
      section: sectionLabel,
      workspace: workspace.name,
    }),
  );

  const frameStatus = !canView
    ? "ready"
    : statesQuery.status === "pending"
      ? "loading"
      : statesQuery.status === "error"
        ? "error"
        : "ready";

  const {
    serverAlert,
    fieldErrors,
    changeGroupState,
    setChangeGroupState,
    deleteTarget,
    setDeleteTarget,
    handleCreate,
    handleUpdate,
    handleConfirmChangeGroup,
    handleDeleteConfirm,
    setServerError,
  } = useStatePageActions({
    states: statesQuery.data?.states,
    createMutation,
    updateMutation,
    deleteMutation,
  });

  return (
    <SettingsSectionFrame
      icon={StatesIcon}
      label={sectionLabel}
      allowed={canView}
      status={frameStatus}
      errorMessage={t("state:page.loadFailed")}
      retryLabel={t("state:page.retry")}
      onRetry={() => void statesQuery.refetch()}
    >
      {statesQuery.data && (
        <>
          <StateList
            states={statesQuery.data.states}
            ownLevel="workspace"
            canManage={canManage}
            ownCount={statesQuery.data.ownCount}
            ownMax={statesQuery.data.ownMax}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={(state) => setDeleteTarget(state)}
            serverAlert={serverAlert}
            isSaving={
              createMutation.isPending ||
              updateMutation.isPending ||
              deleteMutation.isPending
            }
            serverFieldError={fieldErrors.name}
          />

          <StateModals
            changeGroupState={changeGroupState}
            deleteTarget={deleteTarget}
            availableStates={statesQuery.data.states}
            isUpdating={updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
            onConfirmChangeGroup={handleConfirmChangeGroup}
            onCancelChangeGroup={() => setChangeGroupState(null)}
            onConfirmDelete={handleDeleteConfirm}
            onCancelDelete={() => setDeleteTarget(null)}
            onRefetch={async () => {
              await statesQuery.refetch();
            }}
            onNotFound={(msg) => {
              setDeleteTarget(null);
              setServerError(msg);
            }}
          />
        </>
      )}
    </SettingsSectionFrame>
  );
}
