import { TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useTranslation } from "react-i18next";
import classes from "./userFormFields.module.css";

export interface UserNameFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturnType<any>;
  readOnly?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function UserNameFields({
  form,
  readOnly,
  autoFocus,
  className,
}: UserNameFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? classes.row}>
      <TextInput
        label={t("admin:users.form.firstName")}
        withAsterisk
        autoComplete="off"
        data-autofocus={autoFocus ? true : undefined}
        data-1p-ignore
        data-lpignore="true"
        readOnly={readOnly}
        {...form.getInputProps("firstName")}
        key={form.key("firstName")}
      />
      <TextInput
        label={t("admin:users.form.lastName")}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        readOnly={readOnly}
        {...form.getInputProps("lastName")}
        key={form.key("lastName")}
      />
    </div>
  );
}

export interface DisplayNameFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturnType<any>;
  readOnly?: boolean;
}

export function DisplayNameField({ form, readOnly }: DisplayNameFieldProps) {
  const { t } = useTranslation();

  return (
    <TextInput
      label={t("admin:users.form.displayName")}
      withAsterisk
      autoComplete="off"
      description={t("admin:users.form.displayNameDescription")}
      data-1p-ignore
      data-lpignore="true"
      readOnly={readOnly}
      {...form.getInputProps("displayName")}
      key={form.key("displayName")}
    />
  );
}
