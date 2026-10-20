import { PasswordInput } from "@mantine/core";
import type { GetInputPropsReturnType } from "@mantine/form";
import { PASSWORD_MIN } from "@repo/contracts";
import { useTranslation } from "react-i18next";
import classes from "./NewPasswordFields.module.css";

export interface NewPasswordFieldsProps {
  passwordProps: GetInputPropsReturnType;
  confirmProps: GetInputPropsReturnType;
  passwordLabel: string;
  confirmLabel: string;
  readOnly?: boolean;
  className?: string;
}

export function NewPasswordFields({
  passwordProps,
  confirmProps,
  passwordLabel,
  confirmLabel,
  readOnly,
  className,
}: NewPasswordFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? classes.container}>
      <PasswordInput
        label={passwordLabel}
        withAsterisk
        autoComplete="new-password"
        description={t("users:form.passwordDescription", {
          min: PASSWORD_MIN,
        })}
        visibilityToggleButtonProps={{
          "aria-label": t("users:form.showPassword"),
        }}
        data-1p-ignore
        data-lpignore="true"
        readOnly={readOnly}
        {...passwordProps}
      />
      <PasswordInput
        label={confirmLabel}
        withAsterisk
        autoComplete="new-password"
        description={t("users:form.confirmPasswordDescription")}
        visibilityToggleButtonProps={{
          "aria-label": t("users:form.showPassword"),
        }}
        data-1p-ignore
        data-lpignore="true"
        readOnly={readOnly}
        {...confirmProps}
      />
    </div>
  );
}
