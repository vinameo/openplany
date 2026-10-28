import { useState } from "react";
import { Alert, Anchor } from "@mantine/core";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type {
  CreateStateRequest,
  StateGroup,
  UpdateStateRequest,
} from "@repo/contracts";
import { SettingsSectionFrame } from "../../../settings/SettingsSectionFrame";
import { StatesIcon } from "../../../workspaces/icons";
import { workspaceSettingsPath } from "../../../workspaces/workspacePaths";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { useCurrentProject } from "../../detail/currentProjectContext";
import { ProjectSettingsTitle } from "../ProjectSettingsTitle";
import { useProjectStatesQuery } from "../../../states/api/stateQueries";
import {
  useCreateProjectStateMutation,
  useUpdateProjectStateMutation,
} from "../../../states/api/useStateMutations";
import { parseStateError } from "../../../states/stateErrors";
import { ChangeStateGroupModal } from "../../../states/ChangeStateGroupModal";
import { StateList } from "../../../states/list/StateList";

export function ProjectStatesPage() {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { project } = useCurrentProject();

  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [changeGroupState, setChangeGroupState] = useState<{
    stateId: string;
    stateName: string;
    targetGroup: StateGroup;
    count: number;
    pendingPatch: UpdateStateRequest;
  } | null>(null);

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
        const state = statesQuery.data?.states.find((s) => s.id === stateId);
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
              inheritedNote={inheritedNote}
              serverAlert={serverAlert}
              isSaving={createMutation.isPending || updateMutation.isPending}
              serverFieldError={fieldErrors.name}
            />

            <ChangeStateGroupModal
              opened={changeGroupState !== null}
              stateName={changeGroupState?.stateName ?? ""}
              targetGroup={changeGroupState?.targetGroup ?? "backlog"}
              count={changeGroupState?.count ?? 0}
              isPending={updateMutation.isPending}
              onConfirm={handleConfirmChangeGroup}
              onCancel={() => setChangeGroupState(null)}
            />
          </>
        )}
      </SettingsSectionFrame>
    </>
  );
}
