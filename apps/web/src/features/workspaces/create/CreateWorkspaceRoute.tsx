import { ColorSchemeToggle } from "@repo/ui";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import classes from "./CreateWorkspaceRoute.module.css";

export function CreateWorkspaceRoute() {
  useDocumentTitle("Create workspace · OpenPlany");

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <ColorSchemeToggle size="input-xs" />
      </div>
      <main className={classes.main}>
        <CreateWorkspaceForm />
      </main>
    </div>
  );
}

