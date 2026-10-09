import { Navigate } from "react-router";
import { ColorSchemeToggle } from "@repo/ui";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { CreateUserForm } from "./CreateUserForm";
import classes from "./CreateUserRoute.module.css";

export function CreateUserRoute() {
  useDocumentTitle("Create user · OpenPlany");
  const { state: authState } = useAuth();

  if (authState.status === "authenticated" && !authState.session.user.isInstanceAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className={classes.page}>
      <div className={classes.topBar}>
        <ColorSchemeToggle size="input-xs" />
      </div>
      <main className={classes.main}>
        <CreateUserForm />
      </main>
    </div>
  );
}
