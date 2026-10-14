import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, SimpleGrid, Stack, TextInput } from "@mantine/core";
import type { ProfileFormState } from "./useProfileForm";

interface ProfileFormProps {
  state: ProfileFormState;
  /** Read-only: changing an email is a separate, verified flow. */
  email: string;
  /** The actions row, e.g. the Save button. Rendered inside the <form>. */
  footer: ReactNode;
}

/** The profile fields. Knows nothing about the popup, so a page can reuse it. */
export function ProfileForm({ state, email, footer }: ProfileFormProps) {
  const { t } = useTranslation();
  const { form, isSaving, submitError, handleSubmit } = state;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="md">
        <SimpleGrid
          type="container"
          cols={{ base: 1, "560px": 2, "760px": 3 }}
          spacing="lg"
          verticalSpacing="md"
        >
          <TextInput
            label={t("profile:form.firstName")}
            placeholder={t("profile:form.firstNamePlaceholder")}
            autoComplete="given-name"
            withAsterisk
            readOnly={isSaving}
            data-autofocus
            {...form.getInputProps("firstName")}
            key={form.key("firstName")}
          />
          <TextInput
            label={t("profile:form.lastName")}
            placeholder={t("profile:form.lastNamePlaceholder")}
            autoComplete="family-name"
            readOnly={isSaving}
            {...form.getInputProps("lastName")}
            key={form.key("lastName")}
          />
          <TextInput
            label={t("profile:form.displayName")}
            placeholder={t("profile:form.displayNamePlaceholder")}
            autoComplete="nickname"
            withAsterisk
            readOnly={isSaving}
            {...form.getInputProps("displayName")}
            key={form.key("displayName")}
          />
        </SimpleGrid>
        <SimpleGrid
          type="container"
          cols={{ base: 1, "560px": 2, "760px": 3 }}
          spacing="lg"
        >
          <TextInput
            label={t("profile:form.email")}
            description={t("profile:form.emailDescription")}
            autoComplete="email"
            variant="filled"
            value={email}
            readOnly
          />
        </SimpleGrid>
        {submitError !== null && <Alert color="red">{submitError}</Alert>}
        {footer}
      </Stack>
    </form>
  );
}
