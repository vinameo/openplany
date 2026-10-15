import { Alert, Button, Title } from "@mantine/core";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useCreateUserForm } from "./useCreateUserForm";
import { DisplayNameField, UserNameFields } from "./form/UserNameFields";
import { EmailField } from "./form/EmailField";
import { NewPasswordFields } from "./form/NewPasswordFields";
import classes from "./CreateUserForm.module.css";

export interface CreateUserFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreateUserForm({
  onSuccess,
  onCancel,
}: CreateUserFormProps = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function handleGoBack() {
    if (onCancel) {
      onCancel();
      return;
    }
    if (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  function handleSuccess() {
    if (onSuccess) {
      onSuccess();
      return;
    }
    handleGoBack();
  }

  const { form, isSubmitting, submitError, handleSubmit } = useCreateUserForm({
    onCreated: handleSuccess,
  });

  return (
    <div className={classes.container}>
      <Title order={1} className={classes.title}>
        {t("admin:users.form.title")}
      </Title>

      <form
        onSubmit={handleSubmit}
        noValidate
        autoComplete="off"
        className={classes.form}
      >
        <UserNameFields form={form} readOnly={isSubmitting} autoFocus />

        <div className={classes.row}>
          <DisplayNameField form={form} readOnly={isSubmitting} />
          <EmailField form={form} readOnly={isSubmitting} />
        </div>

        <NewPasswordFields form={form} readOnly={isSubmitting} />

        {submitError && (
          <Alert color="red" title={t("common:error")} role="alert">
            {submitError}
          </Alert>
        )}

        <div className={classes.actions}>
          <Button
            type="submit"
            variant="filled"
            loading={isSubmitting}
            disabled={!form.isValid()}
          >
            {t("admin:users.form.submit")}
          </Button>

          <Button
            type="button"
            variant="default"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            {t("common:actions.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
