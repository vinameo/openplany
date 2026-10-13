import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Indicator,
  Modal,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { ColorSchemeToggle } from "@repo/ui";
import type { RoleRef } from "@repo/contracts";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";
import { ArrowLeftIcon } from "../../workspaces/icons";
import { SettingsSection } from "../../workspaces/settings/SettingsSection";
import { buildProjectAccessRows, buildRolesOverview } from "./rolesOverview";
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
import { rolesLoadError } from "./api/adminRoleQueries";
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
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab =
    searchParams.get("tab") === "project" ? "project" : "workspace";

  function handleTabChange(value: string | null) {
    const nextTab = value === "project" ? "project" : "workspace";
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", nextTab);
        return next;
      },
      { replace: true },
    );
  }

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

  const hasWorkspaceChanges = useMemo(() => {
    return diff.some((item) => item.role.scope === "workspace");
  }, [diff]);

  const hasProjectChanges = useMemo(() => {
    return diff.some((item) => item.role.scope === "project");
  }, [diff]);

  const hasChanges = totalUnsavedChanges > 0;
  const { blocked, proceed, stay } = useUnsavedChangesGuard(hasChanges);

  const projectAccessRows = useMemo(() => {
    if (roleState.status !== "ready") return [];
    return buildProjectAccessRows(roleState.projectAccessPolicies);
  }, [roleState]);

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

        {saveError?.type === "conflict" && (
          <Alert
            color="yellow"
            mb="xl"
            title="Someone else changed these permissions. Reload to see the latest."
          >
            <Group justify="flex-end" mt="xs">
              <Button
                size="xs"
                variant="default"
                onClick={handleConflictReload}
              >
                Reload
              </Button>
            </Group>
          </Alert>
        )}

        {saveError?.type === "invalid" && (
          <Alert color="red" mb="xl" title="Validation error">
            {Object.entries(saveError.fields).map(([field, msg]) => (
              <div key={field}>{msg}</div>
            ))}
          </Alert>
        )}

        {saveError?.type === "failed" && (
          <Alert color="red" mb="xl" title="Error">
            {saveError.message}
          </Alert>
        )}

        <Tabs value={currentTab} onChange={handleTabChange} keepMounted={false}>
          <Tabs.List mb="xl">
            <Tabs.Tab
              value="workspace"
              rightSection={
                hasWorkspaceChanges ? (
                  <>
                    <Indicator size={6} color="blue" offset={0} inline />
                    <VisuallyHidden> (unsaved changes)</VisuallyHidden>
                  </>
                ) : null
              }
            >
              Workspace roles
            </Tabs.Tab>
            <Tabs.Tab
              value="project"
              rightSection={
                hasProjectChanges ? (
                  <>
                    <Indicator size={6} color="blue" offset={0} inline />
                    <VisuallyHidden> (unsaved changes)</VisuallyHidden>
                  </>
                ) : null
              }
            >
              Project roles
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="workspace">
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
                    <Text mb="xs">{rolesLoadError}</Text>
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
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="project">
            <Stack gap="xl">
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
                description="How each workspace role decides access to projects. Set by OpenPlany and the same in every workspace."
              >
                {roleState.status === "loading" && (
                  <Stack gap="xs">
                    <Skeleton height={40} />
                    <Skeleton height={140} />
                  </Stack>
                )}
                {roleState.status === "error" && (
                  <Alert color="red">
                    <Text mb="xs">{rolesLoadError}</Text>
                    <Button size="xs" variant="default" onClick={reload}>
                      Try again
                    </Button>
                  </Alert>
                )}
                {roleState.status === "ready" && (
                  <ProjectAccessTable rows={projectAccessRows} />
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
                {roleState.status === "ready" && projectMatrix && (
                  <PermissionMatrixTable
                    matrix={projectMatrix}
                    readOnly={isSaving}
                    onToggle={handleToggle}
                  />
                )}
              </SettingsSection>
            </Stack>
          </Tabs.Panel>
        </Tabs>

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
          permissions={
            roleState.status === "ready" ? roleState.permissions : []
          }
        />

        <Modal opened={blocked} onClose={stay} title="Discard unsaved changes?">
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
