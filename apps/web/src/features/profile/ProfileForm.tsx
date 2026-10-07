import type { ReactNode } from "react";
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
            label="First name"
            placeholder="Given name"
            autoComplete="given-name"
            withAsterisk
            readOnly={isSaving}
            data-autofocus
            {...form.getInputProps("firstName")}
            key={form.key("firstName")}
          />
          <TextInput
            label="Last name"
            placeholder="Family name"
            autoComplete="family-name"
            readOnly={isSaving}
            {...form.getInputProps("lastName")}
            key={form.key("lastName")}
          />
          <TextInput
            label="Display name"
            placeholder="How others see you"
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
            label="Email"
            description="Contact your admin to change your email."
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
