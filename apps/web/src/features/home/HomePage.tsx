import { Alert, Container } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useAuth } from "../auth/useAuth";
import { ProjectsHome } from "../projects/ProjectsHome";
import { useCurrentWorkspace } from "../workspaces/currentWorkspace/useCurrentWorkspace";
import classes from "./HomePage.module.css";

/** Landing page after sign-in; displays Projects list. */
export function HomePage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const { workspace } = useCurrentWorkspace();

  const title = `${workspace.name} · OpenPlany`;
  useDocumentTitle(title);

  if (state.status !== "authenticated") return null;
  const { user } = state.session;

  return (
    <Container size="lg" className={classes.main}>
      {!user.isEmailVerified && (
        <Alert
          color="yellow"
          mb="lg"
          title={t("workspace:home.verifyEmailTitle")}
        >
          {t("workspace:home.verifyEmailBody")}
        </Alert>
      )}
      <ProjectsHome />
    </Container>
  );
}
