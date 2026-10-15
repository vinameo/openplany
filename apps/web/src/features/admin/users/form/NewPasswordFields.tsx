import { PasswordInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { PASSWORD_MIN } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import classes from "./userFormFields.module.css";

export interface NewPasswordFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturnType<any>;
  readOnly?: boolean;
  className?: string;
}

export function NewPasswordFields({
  form,
  readOnly,
  className,
}: NewPasswordFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? classes.row}>
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
        readOnly={readOnly}
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
        readOnly={readOnly}
        {...form.getInputProps("confirmPassword")}
        key={form.key("confirmPassword")}
      />
    </div>
  );
}
