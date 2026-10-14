import { Alert, Button, PasswordInput, TextInput, Title } from "@mantine/core";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { PASSWORD_MIN } from "@repo/contracts";
import { useCreateUserForm } from "./useCreateUserForm";
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
        <div className={classes.row}>
          <TextInput
            label={t("admin:users.form.firstName")}
            withAsterisk
            autoComplete="off"
            data-autofocus
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("firstName")}
            key={form.key("firstName")}
          />
          <TextInput
            label={t("admin:users.form.lastName")}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("lastName")}
            key={form.key("lastName")}
          />
        </div>

        <div className={classes.row}>
          <TextInput
            label={t("admin:users.form.displayName")}
            withAsterisk
            autoComplete="off"
            description={t("admin:users.form.displayNameDescription")}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("displayName")}
            key={form.key("displayName")}
          />
          <TextInput
            label={t("admin:users.form.email")}
            withAsterisk
            type="email"
            inputMode="email"
            autoComplete="off"
            description={t("admin:users.form.emailDescription")}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("email")}
            key={form.key("email")}
          />
        </div>

        <div className={classes.row}>
          <PasswordInput
            label={t("admin:users.form.password")}
            withAsterisk
            autoComplete="new-password"
            description={t("admin:users.form.passwordDescription", {
              min: PASSWORD_MIN,
            })}
            visibilityToggleButtonProps={{
              "aria-label": t("admin:users.form.showPassword"),
            }}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("password")}
            key={form.key("password")}
          />
          <PasswordInput
            label={t("admin:users.form.confirmPassword")}
            withAsterisk
            autoComplete="new-password"
            description={t("admin:users.form.confirmPasswordDescription")}
            visibilityToggleButtonProps={{
              "aria-label": t("admin:users.form.showPassword"),
            }}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("confirmPassword")}
            key={form.key("confirmPassword")}
          />
        </div>

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
