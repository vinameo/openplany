import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  PROJECT_ROLE_CHANGE_MESSAGES,
  PROJECT_ROLE_LABELS,
  type ChangeProjectRoleRequest,
  type ChangeProjectRoleResponse,
  type ProjectMemberResponse,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import {
  changeRoleFailed,
  tooManyAttemptsMessage,
} from "../../../members/membersMessages";
import { projectMembersApi } from "../../api/projectMembersApi";
import {
  projectKeys,
  projectMemberMutationKeys,
  replaceProjectMemberInCache,
} from "../../api/projectQueries";
import { toastChanged } from "./projectMembersMessages";

export interface ChangeProjectRoleVariables {
  userId: string;
  body: ChangeProjectRoleRequest;
  memberName: string;
}

export interface UseChangeProjectRoleOptions {
  slug: string;
  identifier: string;
  projectName: string;
  onSuccess?: (member: ProjectMemberResponse) => void;
  onSettledFocus?: (userId: string) => void;
}

export function getProjectRoleChangeErrorMessage(err: unknown): {
  message: string;
  shouldReload: boolean;
} {
  if (err instanceof ApiRequestError) {
    if (err.code === "PROJECT_NOT_FOUND") {
      return {
        message: PROJECT_ERROR_MESSAGES.notFound,
        shouldReload: true,
      };
    }
    if (err.code === "ROLE_INHERITED") {
      return {
        message: PROJECT_ROLE_CHANGE_MESSAGES.inherited,
        shouldReload: true,
      };
    }
    if (err.code === "ROLE_CHANGED") {
      return {
        message: MEMBER_MESSAGES.roleChanged,
        shouldReload: true,
      };
    }
    if (err.status === 404 || err.code === "NOT_FOUND") {
      return {
        message: PROJECT_ROLE_CHANGE_MESSAGES.memberGone,
        shouldReload: true,
      };
    }
    if (err.status === 403 || err.code === "FORBIDDEN") {
      return {
        message:
          err.message === MEMBER_MESSAGES.roleNotAllowed
            ? MEMBER_MESSAGES.roleNotAllowed
            : PROJECT_ROLE_CHANGE_MESSAGES.cantChange,
        shouldReload: true,
      };
    }
    if (err.code === "PROJECT_ROLE_NOT_ALLOWED") {
      return {
        message: MEMBER_MESSAGES.roleOutOfRange,
        shouldReload: false,
      };
    }
    if (err.code === "ROLE_UNCHANGED") {
      return {
        message: MEMBER_MESSAGES.sameRole,
        shouldReload: false,
      };
    }
    if (err.status === 429 || err.code === "TOO_MANY_ATTEMPTS") {
      return {
        message: tooManyAttemptsMessage(err.retryAfterSeconds),
        shouldReload: false,
      };
    }
  }
  return {
    message: changeRoleFailed,
    shouldReload: false,
  };
}

export function useChangeProjectRole({
  slug,
  identifier,
  projectName,
  onSuccess,
  onSettledFocus,
}: UseChangeProjectRoleOptions) {
  const qc = useQueryClient();

  const changeRole = useCallback(
    async (
      vars: ChangeProjectRoleVariables,
    ): Promise<ChangeProjectRoleResponse> => {
      const mutation = qc.getMutationCache().build(qc, {
        mutationKey: projectMemberMutationKeys.changeRole(
          slug,
          identifier,
          vars.userId,
        ),
        mutationFn: () =>
          projectMembersApi.changeRole(
            slug,
            identifier,
            vars.userId,
            vars.body,
          ),
        onSuccess: (res: ChangeProjectRoleResponse) => {
          replaceProjectMemberInCache(qc, slug, identifier, {
            member: res.member,
            assignedAdminCount: res.assignedAdminCount,
          });

          notifications.show({
            message: toastChanged(
              vars.memberName,
              PROJECT_ROLE_LABELS[res.member.role],
              projectName,
            ),
          });

          onSettledFocus?.(vars.userId);
          onSuccess?.(res.member);
        },
        onError: (err: unknown) => {
          const { message, shouldReload } =
            getProjectRoleChangeErrorMessage(err);

          notifications.show({
            color: "red",
            role: "alert",
            message,
          });

          if (shouldReload) {
            void qc.invalidateQueries({
              queryKey: projectKeys.members(slug, identifier),
            });
            if (
              err instanceof ApiRequestError &&
              err.code === "PROJECT_NOT_FOUND"
            ) {
              void qc.invalidateQueries({
                queryKey: projectKeys.detail(slug, identifier),
              });
              void qc.invalidateQueries({
                queryKey: projectKeys.list(slug),
              });
            }
          }

          onSettledFocus?.(vars.userId);
        },
      });

      return mutation.execute(vars);
    },
    [qc, slug, identifier, projectName, onSuccess, onSettledFocus],
  );

  return {
    mutate: (vars: ChangeProjectRoleVariables) => {
      void changeRole(vars).catch(() => {});
    },
    mutateAsync: changeRole,
  };
}
