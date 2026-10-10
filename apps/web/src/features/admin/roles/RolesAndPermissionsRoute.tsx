import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Navigate, useNavigate } from "react-router";
import { ColorSchemeToggle } from "@repo/ui";
import type { RoleRef } from "@repo/contracts";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";
import { ArrowLeftIcon } from "../../workspaces/icons";
import { SettingsSection } from "../../workspaces/settings/SettingsSection";
import { buildRolesOverview } from "./rolesOverview";
import {
  ProjectAccessTable,
  ProjectRolesTable,
  WorkspaceRolesTable,
} from "./RoleTables";
import {
  type PermissionDraft,
  buildPermissionMatrix,
  diffDraft,
  togglePermission,
  toUpdateRequest,
} from "./permissionMatrix";
import { PermissionMatrixTable } from "./PermissionMatrixTable";
import { SaveChangesBar } from "./SaveChangesBar";
import { ConfirmPermissionChangesModal } from "./ConfirmPermissionChangesModal";
import { useRolePermissions } from "./useRolePermissions";
import classes from "./RolesAndPermissionsRoute.module.css";

type SaveErrorState =
  | { type: "conflict" }
  | { type: "invalid"; fields: Record<string, string> }
  | { type: "failed"; message: string }
  | null;

export function RolesAndPermissionsRoute() {
  useDocumentTitle("Roles & Permissions · OpenPlany");
  const { state: authState } = useAuth();
  const navigate = useNavigate();

  const overview = useMemo(() => buildRolesOverview(), []);
  const { state: roleState, reload, save } = useRolePermissions();

  const [draft, setDraft] = useState<PermissionDraft>({});
  const [confirmModalOpened, setConfirmModalOpened] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveErrorState>(null);

  const diff = useMemo(() => {
    if (roleState.status !== "ready") return [];
    return diffDraft(roleState.roles, draft);
  }, [roleState, draft]);

  const totalUnsavedChanges = useMemo(() => {
    return diff.reduce(
      (sum, item) => sum + item.granted.length + item.revoked.length,
      0,
    );
  }, [diff]);

  const hasChanges = totalUnsavedChanges > 0;
  const { blocked, proceed, stay } = useUnsavedChangesGuard(hasChanges);

  const workspaceMatrix = useMemo(() => {
    if (roleState.status !== "ready") return null;
    return buildPermissionMatrix(
      "workspace",
      roleState.roles,
      draft,
      roleState.permissions,
    );
  }, [roleState, draft]);

  const projectMatrix = useMemo(() => {
    if (roleState.status !== "ready") return null;
    return buildPermissionMatrix(
      "project",
      roleState.roles,
      draft,
      roleState.permissions,
    );
  }, [roleState, draft]);

  if (
    authState.status === "authenticated" &&
    !authState.session.user.isInstanceAdmin
  ) {
    return <Navigate to="/" replace />;
  }

  function handleGoBack() {
    if (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  function handleToggle(role: RoleRef, permission: string) {
    if (roleState.status !== "ready" || isSaving) return;
    setDraft((prev) =>
      togglePermission(
        prev,
        roleState.roles,
        role,
        permission,
        roleState.permissions,
      ),
    );
  }

  function handleDiscard() {
    setDraft({});
    setSaveError(null);
  }

  async function handleConfirmSave() {
    if (roleState.status !== "ready") return;
    setIsSaving(true);
    setSaveError(null);

    const body = toUpdateRequest(roleState.roles, draft);
    const result = await save(body);

    setIsSaving(false);

    if (result.status === "saved") {
      setConfirmModalOpened(false);
      setDraft({});
      notifications.show({
        message: "Permissions updated",
        color: "green",
      });
    } else if (result.status === "conflict") {
      setConfirmModalOpened(false);
      setSaveError({ type: "conflict" });
    } else if (result.status === "invalid") {
      setConfirmModalOpened(false);
      setSaveError({ type: "invalid", fields: result.fields });
    } else {
      setConfirmModalOpened(false);
      setSaveError({ type: "failed", message: result.message });
    }
  }

  function handleConflictReload() {
    setDraft({});
    setSaveError(null);
    reload();
  }

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <ColorSchemeToggle size="input-xs" />
      </div>
      <main className={classes.main}>
        <div className={classes.header}>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<ArrowLeftIcon width={16} height={16} />}
            onClick={handleGoBack}
            aria-label="Back"
            className={classes.backButton}
          >
            Back
          </Button>
          <Title order={1} className={classes.title}>
            Roles & Permissions
          </Title>
          <Text className={classes.subtitle}>
            How roles work in every workspace on this OpenPlany instance.
          </Text>
        </div>

        <Stack gap="xl">
          <SettingsSection
            titleOrder={2}
            title="Workspace roles"
            description="What each role can do in a workspace."
          >
            <WorkspaceRolesTable rows={overview.workspaceRoles} />
          </SettingsSection>

          <SettingsSection
            titleOrder={2}
            title="Project roles"
            description="Each project member has one of these roles in that project."
          >
            <ProjectRolesTable rows={overview.projectRoles} />
          </SettingsSection>

          <SettingsSection
            titleOrder={2}
            title="Workspace roles in projects"
            description="How a workspace role affects access to projects."
          >
            <ProjectAccessTable rows={overview.projectAccess} />
          </SettingsSection>

          {saveError?.type === "conflict" && (
            <Alert
              color="yellow"
              title="Someone else changed these permissions. Reload to see the latest."
            >
              <Group justify="flex-end" mt="xs">
                <Button size="xs" variant="default" onClick={handleConflictReload}>
                  Reload
                </Button>
              </Group>
            </Alert>
          )}

          {saveError?.type === "invalid" && (
            <Alert color="red" title="Validation error">
              {Object.entries(saveError.fields).map(([field, msg]) => (
                <div key={field}>{msg}</div>
              ))}
            </Alert>
          )}

          {saveError?.type === "failed" && (
            <Alert color="red" title="Error">
              {saveError.message}
            </Alert>
          )}

          <SettingsSection
            titleOrder={2}
            title="Workspace permissions"
            description="Choose what each workspace role can do. Changes apply to every workspace on this instance."
          >
            {roleState.status === "loading" && (
              <Stack gap="xs">
                <Skeleton height={40} />
                <Skeleton height={200} />
              </Stack>
            )}
            {roleState.status === "error" && (
              <Alert color="red">
                <Text mb="xs">Couldn't load permissions.</Text>
                <Button size="xs" variant="default" onClick={reload}>
                  Try again
                </Button>
              </Alert>
            )}
            {roleState.status === "ready" && workspaceMatrix && (
              <PermissionMatrixTable
                matrix={workspaceMatrix}
                readOnly={isSaving}
                onToggle={handleToggle}
              />
            )}
          </SettingsSection>

          <SettingsSection
            titleOrder={2}
            title="Project permissions"
            description="Choose what each project role can do. Changes apply to every project on this instance."
          >
            {roleState.status === "loading" && (
              <Stack gap="xs">
                <Skeleton height={40} />
                <Skeleton height={200} />
              </Stack>
            )}
            {roleState.status === "error" && (
              <Alert color="red">
                <Text mb="xs">Couldn't load permissions.</Text>
                <Button size="xs" variant="default" onClick={reload}>
                  Try again
                </Button>
              </Alert>
            )}
            {roleState.status === "ready" && projectMatrix && (
              <PermissionMatrixTable
                matrix={projectMatrix}
                readOnly={isSaving}
                onToggle={handleToggle}
              />
            )}
          </SettingsSection>
        </Stack>

        <SaveChangesBar
          changeCount={totalUnsavedChanges}
          onDiscard={handleDiscard}
          onSaveClick={() => setConfirmModalOpened(true)}
          disabled={isSaving}
        />

        <ConfirmPermissionChangesModal
          opened={confirmModalOpened}
          onClose={() => setConfirmModalOpened(false)}
          diff={diff}
          onConfirm={handleConfirmSave}
          isSaving={isSaving}
          permissions={roleState.status === "ready" ? roleState.permissions : []}
        />

        <Modal
          opened={blocked}
          onClose={stay}
          title="Discard unsaved changes?"
        >
          <Stack gap="md">
            <Text size="sm">
              You have unsaved changes that will be lost if you leave this page.
            </Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={stay}>
                Keep editing
              </Button>
              <Button color="red" onClick={proceed}>
                Discard
              </Button>
            </Group>
          </Stack>
        </Modal>
      </main>
    </div>
  );
}
