import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/useAuth";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle";
import { AdminPageLayout } from "../AdminPageLayout";
import { CreateUserForm } from "./CreateUserForm";

export function CreateUserRoute() {
  const { t } = useTranslation();
  useDocumentTitle(t("admin:users.documentTitle"));
  const { state: authState } = useAuth();

  if (
    authState.status === "authenticated" &&
    !authState.session.user.isInstanceAdmin
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminPageLayout maxWidth={840}>
      <CreateUserForm />
    </AdminPageLayout>
  );
}
