import { useMemo, useState } from "react";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { ApiRequestError } from "../../lib/apiClient";
import type { AuthUser } from "../auth/api/authTypes";
import { useAuth } from "../auth/useAuth";
import { GENERIC_PROFILE_ERROR, profileApi } from "./api/profileApi";
import {
  diffProfile,
  PROFILE_FIELDS,
  validateName,
  type ProfileField,
  type ProfileValues,
} from "./profileValidation";

interface UseProfileFormOptions {
  user: AuthUser;
  /** Called after the profile was saved and the signed-in user was updated. */
  onSaved: () => void;
}

/** Form state, validation and saving for the profile popup. */
export function useProfileForm({ user, onSaved }: UseProfileFormOptions) {
  const { updateUser, expireSession } = useAuth();
  // Snapshot at mount: later changes to the signed-in user must not overwrite typing.
  const [initialValues] = useState<ProfileValues>(() => ({
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<ProfileValues>({
    mode: "controlled",
    initialValues,
    validateInputOnBlur: true,
    validate: {
      firstName: (value) => validateName("firstName", value),
      lastName: (value) => validateName("lastName", value),
      displayName: (value) => validateName("displayName", value),
    },
  });

  const changes = useMemo(
    () => diffProfile(initialValues, form.values),
    [initialValues, form.values],
  );
  const hasChanges = Object.keys(changes).length > 0;

  function focusFirstError(errors: Record<string, unknown>): void {
    const first = PROFILE_FIELDS.find((field) => field in errors);
    if (first !== undefined)
      form.getInputNode<HTMLInputElement, ProfileField>(first)?.focus();
  }

  async function save(): Promise<void> {
    setSubmitError(null);
    setIsSaving(true);
    try {
      const saved = await profileApi.updateMe(changes);
      updateUser(saved);
      notifications.show({
        message: "Profile updated",
        color: "green",
        autoClose: 3000,
      });
      onSaved();
    } catch (error: unknown) {
      if (!(error instanceof ApiRequestError)) {
        console.error("Profile update failed unexpectedly", error);
        setSubmitError(GENERIC_PROFILE_ERROR);
        return;
      }
      if (error.status === 401) {
        expireSession();
        return;
      }
      if (error.status === 400 && Object.keys(error.fields).length > 0) {
        form.setErrors(error.fields);
        focusFirstError(error.fields);
        return;
      }
      setSubmitError(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const handleSubmit = form.onSubmit(() => void save(), focusFirstError);

  return { form, hasChanges, isSaving, submitError, handleSubmit };
}

export type ProfileFormState = ReturnType<typeof useProfileForm>;
