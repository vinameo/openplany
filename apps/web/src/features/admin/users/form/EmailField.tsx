import { TextInput } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import { useTranslation } from "react-i18next";

export interface EmailFieldProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturnType<any>;
  readOnly?: boolean;
}

export function EmailField({ form, readOnly }: EmailFieldProps) {
  const { t } = useTranslation();

  return (
    <TextInput
      label={t("admin:users.form.email")}
      withAsterisk
      type="email"
      inputMode="email"
      autoComplete="off"
      description={t("admin:users.form.emailDescription")}
      data-1p-ignore
      data-lpignore="true"
      readOnly={readOnly}
      {...form.getInputProps("email")}
      key={form.key("email")}
    />
  );
}
