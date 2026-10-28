import { Anchor } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { SettingsSectionFrame } from "../../../settings/SettingsSectionFrame";
import { StatesIcon } from "../../../workspaces/icons";
import { workspaceSettingsPath } from "../../../workspaces/workspacePaths";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useCurrentProject } from "../../detail/currentProjectContext";
import { ProjectSettingsTitle } from "../ProjectSettingsTitle";
import { useProjectStatesQuery } from "../../../states/api/stateQueries";
import {
  useCreateProjectStateMutation,
  useDeleteProjectStateMutation,
  useUpdateProjectStateMutation,
} from "../../../states/api/useStateMutations";
import { StateList } from "../../../states/list/StateList";
import { useStatePageActions } from "../../../states/useStatePageActions";
import { StateModals } from "../../../states/StateModals";

export function ProjectStatesPage() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { project } = useCurrentProject();

  const canView = project?.permissions.includes("project.states.view") ?? false;
  const canManage =
    project?.permissions.includes("project.states.manage") ?? false;
  const canManageWorkspace = workspace.permissions.includes(
    "workspace.states.manage",
  );

  const projectIdentifier = project?.identifier ?? "";
  const statesQuery = useProjectStatesQuery(
    workspace.slug,
    projectIdentifier,
    canView && Boolean(project),
  );

  const createMutation = useCreateProjectStateMutation(
    workspace.slug,
    projectIdentifier,
  );
  const updateMutation = useUpdateProjectStateMutation(
    workspace.slug,
    projectIdentifier,
  );
  const deleteMutation = useDeleteProjectStateMutation(
    workspace.slug,
    projectIdentifier,
  );

  const sectionLabel = t("project:settings.sections.states");

  const frameStatus = !canView
    ? "ready"
    : statesQuery.status === "pending"
      ? "loading"
      : statesQuery.status === "error"
        ? "error"
        : "ready";

  const inheritedNote = canManageWorkspace ? (
    <Anchor
      component={Link}
      to={workspaceSettingsPath(workspace.slug, "states")}
      size="sm"
    >
      {t("state:page.editInWorkspace")} &rarr;
    </Anchor>
  ) : undefined;

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
    <>
      <ProjectSettingsTitle title={sectionLabel} />
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
              ownLevel="project"
              canManage={canManage}
              ownCount={statesQuery.data.ownCount}
              ownMax={statesQuery.data.ownMax}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onDelete={(state) => setDeleteTarget(state)}
              inheritedNote={inheritedNote}
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
    </>
  );
}
