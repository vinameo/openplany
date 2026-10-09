import { useMemo } from "react";
import { Button, Stack, Text, Title } from "@mantine/core";
import { Navigate, useNavigate } from "react-router";
import { ColorSchemeToggle } from "@repo/ui";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { ArrowLeftIcon } from "../../workspaces/icons";
import { SettingsSection } from "../../workspaces/settings/SettingsSection";
import { buildRolesOverview } from "./rolesOverview";
import {
  PermissionMatrix,
  ProjectAccessTable,
  ProjectRolesTable,
  WorkspaceRolesTable,
} from "./RoleTables";
import classes from "./RolesAndPermissionsRoute.module.css";

export function RolesAndPermissionsRoute() {
  useDocumentTitle("Roles & Permissions · OpenPlany");
  const { state: authState } = useAuth();
  const navigate = useNavigate();
  const overview = useMemo(() => buildRolesOverview(), []);

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

          <SettingsSection
            titleOrder={2}
            title="What each role can do"
            description="Actions OpenPlany checks today. More appear as features are added."
          >
            <PermissionMatrix rows={overview.permissionMatrix} />
          </SettingsSection>
        </Stack>
      </main>
    </div>
  );
}
