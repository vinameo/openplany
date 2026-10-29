import { useCallback } from "react";
import { useNavigate } from "react-router";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { translateRef } from "../../../../i18n/language";
import {
  normalizeProjectName,
  projectNameProblem,
  projectDescriptionProblem,
  type ProjectListItem,
} from "@repo/contracts";
import { GENERIC_ERROR_KEY } from "../../../../lib/apiClient";
import {
  SETTINGS_MESSAGES,
  tooManyChangesMessage,
} from "../../../settings/settingsMessages";
import { useSettingsForm } from "../../../settings/useSettingsForm";
import { useCurrentWorkspace } from "../../../workspaces/currentWorkspace/useCurrentWorkspace";
import { workspacePath } from "../../../workspaces/workspacePaths";
import { projectsApi } from "../../api/projectsApi";
import { removeProjectFromCache } from "../../api/projectQueries";
import { useCurrentProject } from "../../detail/currentProjectContext";
import {
  PROJECT_SETTINGS_FIELDS,
  toProjectSettingsValues,
  toUpdateProjectRequest,
  type ProjectSettingsValues,
} from "../projectSettingsValues";

export function useProjectGeneralSettingsForm(project: ProjectListItem) {
  const { t } = useTranslation();
  const { workspace } = useCurrentWorkspace();
  const { reload, applyProjectUpdate } = useCurrentProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const canEdit = project.permissions.includes("project.settings.update");

  const submit = useCallback(
    async (changes: Partial<ProjectSettingsValues>) => {
      const currentValues = toProjectSettingsValues(project);
      const req = toUpdateProjectRequest(changes, currentValues);
      const res = await projectsApi.update(
        workspace.slug,
        project.identifier,
        req,
      );
      applyProjectUpdate(res.project);
      notifications.show({
        message: t("project:settings.general.successNotification"),
        color: "teal",
      });
      return toProjectSettingsValues(res.project);
    },
    [workspace.slug, project, applyProjectUpdate, t],
  );

  const onApiError = useCallback(
    (error: { status: number; retryAfterSeconds?: number | null }) => {
      if (error.status === 403) {
        void reload();
        return SETTINGS_MESSAGES.permissionLost;
      }
      if (error.status === 404) {
        notifications.show({
          message: t("project:errors.notFound"),
          color: "red",
        });
        void Promise.resolve(
          navigate(workspacePath(workspace.slug), { replace: true }),
        )
          .then(() =>
            removeProjectFromCache(
              queryClient,
              workspace.slug,
              project.identifier,
            ),
          )
          .catch((err: unknown) =>
            console.error("project.settings.leave_failed", err),
          );
        return null;
      }
      if (error.status === 429) {
        return tooManyChangesMessage(error.retryAfterSeconds ?? null);
      }
      return t(GENERIC_ERROR_KEY);
    },
    [reload, navigate, workspace.slug, queryClient, project.identifier, t],
  );

  const {
    form,
    changes,
    hasChanges,
    isSaving,
    submitError,
    setSubmitError,
    handleSubmit,
  } = useSettingsForm({
    source: toProjectSettingsValues(project),
    sourceVersion: project.updatedAt,
    fields: PROJECT_SETTINGS_FIELDS,
    normalize: {
      name: normalizeProjectName,
    },
    validate: {
      name: (val) => {
        if (val === undefined) return null;
        const problem = projectNameProblem(String(val));
        return problem ? translateRef(t, problem) : null;
      },
      description: (val) => {
        if (val === undefined) return null;
        const problem = projectDescriptionProblem(String(val));
        return problem ? translateRef(t, problem) : null;
      },
    },
    submit,
    onApiError,
  });

  return {
    form,
    changes,
    hasChanges,
    isSaving,
    submitError,
    setSubmitError,
    handleSubmit,
    canEdit,
  };
}
