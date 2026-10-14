import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Select,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  isProjectAdminRole,
  isViewOnlyRole,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLE_SUMMARIES,
  projectRoleAppliedBy,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  type ProjectRole,
  type WorkspaceMemberResponse,
  type WorkspaceRole,
} from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { BoundedProjectList } from "../../../members/BoundedProjectList";
import { memberDisplayName } from "../../../members/memberListView";
import { RoleChangeConfirmModal } from "../../../members/RoleChangeConfirmModal";
import { tooManyAttemptsMessage } from "../../../members/membersMessages";
import { membersApi } from "./api/membersApi";
import { workspaceMemberKeys } from "./api/workspaceMemberQueries";
import { useChangeWorkspaceRole } from "./useChangeWorkspaceRole";
import {
  confirmTitle,
  gainImplicit,
  inProjects,
  loseImplicit,
  losingAdminWarning,
  noProjects,
  onlyAdminsChoose,
  previewFailed,
  rolesReplaced,
} from "./workspaceRoleChangeMessages";

export interface ChangeWorkspaceRoleModalProps {
  opened: boolean;
  member: WorkspaceMemberResponse | null;
  toRole: WorkspaceRole | null;
  slug: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangeWorkspaceRoleModal({
  opened,
  member,
  toRole,
  slug,
  onClose,
  onSuccess,
}: ChangeWorkspaceRoleModalProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [customProjectRole, setCustomProjectRole] =
    useState<ProjectRole | null>(null);

  const changeRole = useChangeWorkspaceRole({
    slug,
    onSuccess: () => {
      setCustomProjectRole(null);
      onSuccess?.();
      onClose();
    },
  });

  const previewQuery = useQuery({
    queryKey:
      member && toRole
        ? workspaceMemberKeys.roleChangePreview(slug, member.userId, toRole)
        : ["workspaces", slug, "role-change-preview-disabled"],
    queryFn: ({ signal }) =>
      membersApi.previewRoleChange(slug, member!.userId, toRole!, signal),
    enabled: opened && !!member && !!toRole,
    staleTime: 0,
    gcTime: 10_000,
  });

  const preview = previewQuery.data;
  const selectedProjectRole =
    customProjectRole ?? preview?.defaultProjectRole ?? null;
  // The server lists projects this change *can* leave without an assigned
  // Project Admin; warn unless the role actually picked keeps them Admin.
  const appliedProjectRole =
    preview && projectRoleAppliedBy(preview, selectedProjectRole);
  const showLosingAdminWarning =
    !!preview &&
    preview.projectsLosingAssignedAdmin.total > 0 &&
    !(appliedProjectRole && isProjectAdminRole(appliedProjectRole));

  // Handle preview error cache invalidation
  useEffect(() => {
    if (previewQuery.isError && previewQuery.error instanceof ApiRequestError) {
      const err = previewQuery.error;
      if (
        (err.status === 400 && err.code === "ROLE_UNCHANGED") ||
        err.status === 403 ||
        err.status === 404
      ) {
        void qc.invalidateQueries({
          queryKey: workspaceMemberKeys.list(slug),
        });
      }
    }
  }, [previewQuery.isError, previewQuery.error, qc, slug]);

  // Handle stale role mismatch
  const isRoleStale =
    !!preview && !!member && preview.fromRole !== member.role;

  useEffect(() => {
    if (isRoleStale) {
      void qc.invalidateQueries({
        queryKey: workspaceMemberKeys.list(slug),
      });
    }
  }, [isRoleStale, qc, slug]);

  if (!member || !toRole) {
    return null;
  }

  const displayName = memberDisplayName(member);
  const roleLabel = WORKSPACE_ROLE_QUALIFIED_LABELS[toRole] ?? toRole;
  const isDanger =
    preview?.effect === "lose_implicit" ||
    isViewOnlyRole({ scope: "workspace", key: toRole });

  let previewErrorMessage: string | null = null;
  let canRetryPreview = false;

  if (previewQuery.isError) {
    const err = previewQuery.error;
    if (err instanceof ApiRequestError) {
      if (err.status === 400 && err.code === "ROLE_UNCHANGED") {
        previewErrorMessage = t("members:errors.sameRole");
      } else if (err.status === 403 || err.code === "FORBIDDEN") {
        previewErrorMessage = t("members:errors.roleNotAllowed");
      } else if (err.status === 404 || err.code === "NOT_FOUND") {
        previewErrorMessage = t("workspace:errors.memberGone");
      } else if (err.status === 429 || err.code === "TOO_MANY_ATTEMPTS") {
        previewErrorMessage = tooManyAttemptsMessage(err.retryAfterSeconds);
      } else {
        previewErrorMessage = previewFailed();
        canRetryPreview = true;
      }
    } else {
      previewErrorMessage = previewFailed();
      canRetryPreview = true;
    }
  }

  const confirmDisabled =
    previewQuery.isLoading ||
    previewQuery.isError ||
    isRoleStale ||
    !preview;

  const handleConfirm = () => {
    if (confirmDisabled || !preview) return;

    changeRole.mutate({
      userId: member.userId,
      body: {
        fromRole: preview.fromRole,
        role: toRole,
        projectRole:
          preview.effect === "apply_project_role" &&
          preview.actorCanChooseProjectRole
            ? selectedProjectRole
            : undefined,
      },
      memberName: displayName,
    });
  };

  const handleCancel = () => {
    setCustomProjectRole(null);
    changeRole.clearError();
    onClose();
  };

  return (
    <RoleChangeConfirmModal
      opened={opened}
      title={confirmTitle(displayName, roleLabel)}
      confirmLabel={t("members:roleChange.confirmButton", { role: roleLabel })}
      danger={isDanger}
      pending={changeRole.isPending}
      confirmDisabled={confirmDisabled}
      error={changeRole.errorMessage}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      {previewQuery.isLoading ? (
        <Stack gap="xs">
          <Skeleton height={20} width="80%" />
          <Skeleton height={20} width="50%" />
        </Stack>
      ) : previewErrorMessage ? (
        <Alert color="red" role="alert">
          <Group justify="space-between" align="center">
            <Text size="sm">{previewErrorMessage}</Text>
            {canRetryPreview ? (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                onClick={() => previewQuery.refetch()}
              >
                {t("common:actions.tryAgain")}
              </Button>
            ) : null}
          </Group>
        </Alert>
      ) : isRoleStale ? (
        <Alert color="red" role="alert">
          {t("members:errors.roleChanged")}
        </Alert>
      ) : preview ? (
        <Stack gap="md">
          {preview.effect === "gain_implicit" && (
            <Stack gap="xs">
              <Text size="sm">{gainImplicit(displayName)}</Text>
              {preview.affectedProjects.total > 0 && (
                <>
                  <Text size="sm">
                    {rolesReplaced(preview.affectedProjects.total)}
                  </Text>
                  <BoundedProjectList
                    projects={preview.affectedProjects.projects}
                    total={preview.affectedProjects.total}
                    hiddenCount={preview.affectedProjects.hiddenCount}
                  />
                </>
              )}
            </Stack>
          )}

          {preview.effect === "lose_implicit" && (
            <Stack gap="xs">
              <Text size="sm" fw={700}>
                {loseImplicit(displayName, preview.affectedProjects.total)}
              </Text>
              <BoundedProjectList
                projects={preview.affectedProjects.projects}
                total={preview.affectedProjects.total}
                hiddenCount={preview.affectedProjects.hiddenCount}
              />
            </Stack>
          )}

          {preview.effect === "apply_project_role" && (
            <Stack gap="sm">
              <Text size="sm">
                {inProjects(displayName, preview.affectedProjects.total)}
              </Text>

              <Select
                label={t("members:roleChange.projectRoleLabel")}
                value={selectedProjectRole}
                data={preview.projectRoleChoices.map((r) => ({
                  value: r,
                  label: PROJECT_ROLE_LABELS[r] ?? r,
                }))}
                disabled={!preview.actorCanChooseProjectRole}
                description={
                  !preview.actorCanChooseProjectRole
                    ? onlyAdminsChoose(
                        (preview.defaultProjectRole &&
                          PROJECT_ROLE_LABELS[preview.defaultProjectRole]) ??
                          preview.defaultProjectRole ??
                          "",
                      )
                    : undefined
                }
                allowDeselect={false}
                searchable={false}
                comboboxProps={{ withinPortal: true }}
                onChange={(val) =>
                  setCustomProjectRole(val as ProjectRole | null)
                }
                renderOption={({ option }) => {
                  const desc =
                    PROJECT_ROLE_SUMMARIES[option.value as ProjectRole];
                  return (
                    <Stack gap={2}>
                      <Text size="sm">{option.label}</Text>
                      {desc ? (
                        <Text size="xs" c="dimmed">
                          {desc}
                        </Text>
                      ) : null}
                    </Stack>
                  );
                }}
              />

              <BoundedProjectList
                projects={preview.affectedProjects.projects}
                total={preview.affectedProjects.total}
                hiddenCount={preview.affectedProjects.hiddenCount}
              />
            </Stack>
          )}

          {preview.effect === "no_projects" && (
            <Text size="sm">{noProjects(displayName)}</Text>
          )}

          {showLosingAdminWarning && (
            <Alert color="yellow" title={t("common:warning")}>
              <Stack gap="xs">
                <Text size="sm">{losingAdminWarning()}</Text>
                <BoundedProjectList
                  projects={
                    preview.projectsLosingAssignedAdmin.projects
                  }
                  total={preview.projectsLosingAssignedAdmin.total}
                  hiddenCount={
                    preview.projectsLosingAssignedAdmin.hiddenCount
                  }
                />
              </Stack>
            </Alert>
          )}
        </Stack>
      ) : null}
    </RoleChangeConfirmModal>
  );
}
