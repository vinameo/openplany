import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ColorSchemeToggle } from "@repo/ui";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import classes from "./CreateWorkspaceRoute.module.css";

export function CreateWorkspaceRoute() {
  const { t } = useTranslation();
  useDocumentTitle("Create workspace · OpenPlany");
  const { state: authState } = useAuth();

  if (
    authState.status === "authenticated" &&
    !authState.session.user.isInstanceAdmin
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <ColorSchemeToggle
          size="input-xs"
          labelLight={t("common:theme.switchToLight")}
          labelDark={t("common:theme.switchToDark")}
        />
      </div>
      <main className={classes.main}>
        <CreateWorkspaceForm />
      </main>
    </div>
  );
}

