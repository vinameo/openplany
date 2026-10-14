import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  MEMBER_MESSAGE_REFS,
  PROJECT_ERROR_MESSAGE_REFS,
  PROJECT_ROLE_CHANGE_MESSAGE_REFS,
  PROJECT_ROLE_LABELS,
  type ChangeProjectRoleRequest,
  type ChangeProjectRoleResponse,
  type ProjectMemberResponse,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { translate } from "../../../../i18n/language";
import {
  changeRoleFailedMessage,
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
  inModal?: boolean;
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
        message: translate(PROJECT_ERROR_MESSAGE_REFS.notFound.key),
        shouldReload: true,
      };
    }
    if (err.code === "ROLE_INHERITED") {
      return {
        message: translate(PROJECT_ROLE_CHANGE_MESSAGE_REFS.inherited.key),
        shouldReload: true,
      };
    }
    if (err.code === "ROLE_CHANGED") {
      return {
        message: translate(MEMBER_MESSAGE_REFS.roleChanged.key),
        shouldReload: true,
      };
    }
    if (err.status === 404 || err.code === "NOT_FOUND") {
      return {
        message: translate(PROJECT_ROLE_CHANGE_MESSAGE_REFS.memberGone.key),
        shouldReload: true,
      };
    }
    if (err.code === "ROLE_NOT_ALLOWED") {
      return {
        message: translate(MEMBER_MESSAGE_REFS.roleNotAllowed.key),
        shouldReload: true,
      };
    }
    if (err.status === 403 || err.code === "FORBIDDEN") {
      return {
        message: translate(PROJECT_ROLE_CHANGE_MESSAGE_REFS.cantChange.key),
        shouldReload: true,
      };
    }
    if (err.code === "PROJECT_ROLE_NOT_ALLOWED") {
      return {
        message: translate(MEMBER_MESSAGE_REFS.roleOutOfRange.key),
        shouldReload: false,
      };
    }
    if (err.code === "ROLE_UNCHANGED") {
      return {
        message: translate(MEMBER_MESSAGE_REFS.sameRole.key),
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
    message: changeRoleFailedMessage(),
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

          if (!vars.inModal) {
            notifications.show({
              color: "red",
              role: "alert",
              message,
            });
            onSettledFocus?.(vars.userId);
          }

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
        },
      });

      return mutation.execute(vars);
    },
    [qc, slug, identifier, projectName, onSuccess, onSettledFocus],
  );

  return {
    mutate: (vars: ChangeProjectRoleVariables) => {
      // API errors were already shown by onError; anything else is a bug.
      void changeRole(vars).catch((err: unknown) => {
        if (!(err instanceof ApiRequestError)) {
          console.error("project.member.role_change_failed", err);
        }
      });
    },
    mutateAsync: changeRole,
  };
}
