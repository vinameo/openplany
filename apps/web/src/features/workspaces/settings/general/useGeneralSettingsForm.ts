import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router";
import {
  EDITABLE_WORKSPACE_FIELDS,
  normalizeWorkspaceName,
  workspaceNameProblem,
  type OrganizationSize,
  type WorkspaceResponse,
} from "@repo/contracts";
import type { ApiRequestError } from "../../../../lib/apiClient";
import { workspaceApi } from "../../api/workspaceApi";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { useWorkspaces } from "../../useWorkspaces";
import { useSettingsForm } from "../useSettingsForm";

export interface GeneralSettingsFormValues extends Record<string, unknown> {
  name: string;
  organizationSize: OrganizationSize;
  timezone: string;
}

export function useGeneralSettingsForm(workspace: WorkspaceResponse) {
  const navigate = useNavigate();
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
      name: (val) => workspaceNameProblem(val),
    },
    submit: async (changes) => {
      const response = await workspaceApi.update(workspace.slug, changes);
      applyWorkspaceUpdate(response);
      notifications.show({
        message: "Workspace updated",
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
        return "You no longer have permission to change these settings.";
      }

      if (error.status === 404) {
        notifications.show({
          message: error.message || "Workspace not found",
          color: "red",
        });
        void refresh();
        navigate("/", { replace: true });
        return null;
      }

      if (error.status === 429) {
        const retryAfter = error.retryAfterSeconds ?? 60;
        const minutes = Math.max(1, Math.ceil(retryAfter / 60));
        return `Too many changes. Try again in ${minutes} minutes.`;
      }

      return error.message;
    },
  });

  return {
    ...formManager,
    canEdit,
  };
}
