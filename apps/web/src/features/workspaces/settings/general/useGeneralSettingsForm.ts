import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { translateRef } from "../../../../i18n/language";
import {
  EDITABLE_WORKSPACE_FIELDS,
  normalizeWorkspaceName,
  workspaceNameProblem,
  type OrganizationSize,
  type WorkspaceResponse,
} from "@repo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ApiRequestError } from "../../../../lib/apiClient";
import { projectKeys } from "../../../projects/api/projectQueries";
import { workspaceApi } from "../../api/workspaceApi";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { useWorkspaces } from "../../useWorkspaces";
import {
  SETTINGS_MESSAGES,
  tooManyChangesMessage,
} from "../../../settings/settingsMessages";
import { useSettingsForm } from "../useSettingsForm";

export interface GeneralSettingsFormValues extends Record<string, unknown> {
  name: string;
  organizationSize: OrganizationSize;
  timezone: string;
}

export function useGeneralSettingsForm(workspace: WorkspaceResponse) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { applyWorkspaceUpdate, reload } = useCurrentWorkspace();
  const { refresh } = useWorkspaces();

  const canEdit = workspace.permissions.includes("workspace.settings.update");

  const formManager = useSettingsForm<
    GeneralSettingsFormValues,
    (typeof EDITABLE_WORKSPACE_FIELDS)[number]
  >({
    source: {
      name: workspace.name,
      organizationSize: workspace.organizationSize,
      timezone: workspace.timezone,
    },
    sourceVersion: workspace.updatedAt,
    fields: EDITABLE_WORKSPACE_FIELDS,
    normalize: {
      name: normalizeWorkspaceName,
    },
    validate: {
      name: (val) => {
        const problem = workspaceNameProblem(val);
        return problem ? translateRef(t, problem) : null;
      },
    },
    submit: async (changes) => {
      const response = await workspaceApi.update(workspace.slug, changes);
      applyWorkspaceUpdate(response);
      if (changes.timezone !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: projectKeys.list(workspace.slug),
        });
      }
      notifications.show({
        message: t("workspace:settings.general.updatedNotification"),
        color: "green",
      });
      return {
        name: response.name,
        organizationSize: response.organizationSize,
        timezone: response.timezone,
      };
    },
    onApiError: (error: ApiRequestError) => {
      if (error.status === 403) {
        void reload();
        return SETTINGS_MESSAGES.permissionLost;
      }

      if (error.status === 404) {
        notifications.show({
          message: error.message || t("workspace:errors.notFound"),
          color: "red",
        });
        void refresh();
        navigate("/", { replace: true });
        return null;
      }

      if (error.status === 429) {
        return tooManyChangesMessage(error.retryAfterSeconds);
      }

      return error.message;
    },
  });

  return {
    ...formManager,
    canEdit,
  };
}
