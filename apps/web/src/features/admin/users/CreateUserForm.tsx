import { Alert, Button, PasswordInput, TextInput, Title } from "@mantine/core";
import { useNavigate } from "react-router";
import { PASSWORD_MIN } from "@repo/contracts";
import { useCreateUserForm } from "./useCreateUserForm";
import classes from "./CreateUserForm.module.css";

export interface CreateUserFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CreateUserForm({ onSuccess, onCancel }: CreateUserFormProps = {}) {
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
        Create user
      </Title>

      <form onSubmit={handleSubmit} noValidate autoComplete="off" className={classes.form}>
        <div className={classes.row}>
          <TextInput
            label="First name"
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
            label="Last name"
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
            label="Display name"
            withAsterisk
            autoComplete="off"
            description="How their name appears in OpenPlany."
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("displayName")}
            key={form.key("displayName")}
          />
          <TextInput
            label="Email"
            withAsterisk
            type="email"
            inputMode="email"
            autoComplete="off"
            description="They'll sign in with this email."
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("email")}
            key={form.key("email")}
          />
        </div>

        <div className={classes.row}>
          <PasswordInput
            label="Password"
            withAsterisk
            autoComplete="new-password"
            description={`At least ${PASSWORD_MIN} characters.`}
            visibilityToggleButtonProps={{ "aria-label": "Show password" }}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("password")}
            key={form.key("password")}
          />
          <PasswordInput
            label="Confirm password"
            withAsterisk
            autoComplete="new-password"
            description="Re-enter the password to confirm."
            visibilityToggleButtonProps={{ "aria-label": "Show password" }}
            data-1p-ignore
            data-lpignore="true"
            readOnly={isSubmitting}
            {...form.getInputProps("confirmPassword")}
            key={form.key("confirmPassword")}
          />
        </div>

        {submitError && (
          <Alert color="red" title="Error" role="alert">
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
            Create user
          </Button>

          <Button
            type="button"
            variant="default"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

