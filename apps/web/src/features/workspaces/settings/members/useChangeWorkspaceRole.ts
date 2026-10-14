import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  type ChangeWorkspaceRoleRequest,
  type ChangeWorkspaceRoleResponse,
  type WorkspaceMemberResponse,
} from "@repo/contracts";
import { translate } from "../../../../i18n";
import { ApiRequestError } from "../../../../lib/apiClient";
import { useCurrentWorkspace } from "../../currentWorkspace/useCurrentWorkspace";
import { projectKeys } from "../../../projects/api/projectQueries";
import { membersApi } from "./api/membersApi";
import {
  replaceWorkspaceMemberInCache,
  workspaceMemberKeys,
} from "./api/workspaceMemberQueries";
import {
  changeRoleFailedMessage,
  tooManyAttemptsMessage,
} from "../../../members/membersMessages";
import { toastChanged } from "./workspaceRoleChangeMessages";

export interface UseChangeWorkspaceRoleOptions {
  slug: string;
  onSuccess?: (member: WorkspaceMemberResponse) => void;
}

export function useChangeWorkspaceRole({
  slug,
  onSuccess,
}: UseChangeWorkspaceRoleOptions) {
  const qc = useQueryClient();
  const { reload: reloadWorkspace } = useCurrentWorkspace();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<
    ChangeWorkspaceRoleResponse,
    unknown,
    {
      userId: string;
      body: ChangeWorkspaceRoleRequest;
      memberName: string;
    }
  >({
    mutationFn: ({ userId, body }) =>
      membersApi.changeRole(slug, userId, body),
    onSuccess: (res, vars) => {
      setErrorMessage(null);
      replaceWorkspaceMemberInCache(qc, slug, res.member);

      if (
        res.effect === "gain_implicit" ||
        res.effect === "lose_implicit" ||
        res.appliedProjectCount > 0
      ) {
        void qc.invalidateQueries({ queryKey: projectKeys.list(slug) });
      }

      notifications.show({
        message: toastChanged(
          vars.memberName,
          WORKSPACE_ROLE_QUALIFIED_LABELS[res.member.role],
          res.appliedProjectCount,
        ),
      });

      onSuccess?.(res.member);
    },
    onError: (err) => {
      if (err instanceof ApiRequestError) {
        if (err.code === "LAST_ADMIN") {
          setErrorMessage(translate("workspace:errors.lastAdmin"));
          return;
        }
        if (err.code === "ROLE_UNCHANGED") {
          setErrorMessage(translate("members:errors.sameRole"));
          return;
        }
        if (err.code === "PROJECT_ROLE_NOT_ALLOWED") {
          setErrorMessage(translate("members:errors.roleOutOfRange"));
          return;
        }
        if (err.code === "ROLE_CHANGED") {
          setErrorMessage(translate("members:errors.roleChanged"));
          void qc.invalidateQueries({
            queryKey: workspaceMemberKeys.list(slug),
          });
          return;
        }
        if (err.status === 404 || err.code === "NOT_FOUND") {
          setErrorMessage(translate("workspace:errors.memberGone"));
          void qc.invalidateQueries({
            queryKey: workspaceMemberKeys.list(slug),
          });
          return;
        }
        if (err.status === 403 || err.code === "FORBIDDEN") {
          setErrorMessage(translate("members:errors.roleNotAllowed"));
          void qc.invalidateQueries({
            queryKey: workspaceMemberKeys.list(slug),
          });
          void reloadWorkspace();
          return;
        }
        if (err.status === 429 || err.code === "TOO_MANY_ATTEMPTS") {
          setErrorMessage(tooManyAttemptsMessage(err.retryAfterSeconds));
          return;
        }
      }
      setErrorMessage(changeRoleFailedMessage());
    },
  });

  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
    ...mutation,
    errorMessage,
    clearError,
  };
}
