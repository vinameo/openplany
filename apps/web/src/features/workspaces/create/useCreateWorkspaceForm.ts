import {
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router";
import {
  extractSlugFromUrl,
  NO_HIDDEN_CHARS,
  NO_URL,
  normalizeSlugInput,
  ORGANIZATION_SIZES,
  RESERVED_WORKSPACE_SLUGS,
  slugify,
  WORKSPACE_NAME_MAX,
  WORKSPACE_SLUG_MAX,
  WORKSPACE_SLUG_MIN,
  WORKSPACE_SLUG_PATTERN,
  type CreateWorkspaceRequest,
  type OrganizationSize,
} from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";
import { workspaceApi } from "../api/workspaceApi";
import { useWorkspaces } from "../useWorkspaces";
import { useSlugAvailability } from "./useSlugAvailability";

export function useCreateWorkspaceForm() {
  const navigate = useNavigate();
  const { expireSession } = useAuth();
  const { add } = useWorkspaces();

  const [slugTouched, setSlugTouched] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateWorkspaceRequest>({
    mode: "controlled",
    initialValues: {
      name: "",
      slug: "",
      organizationSize: "" as OrganizationSize,
    },
    validateInputOnBlur: true,
    validate: {
      name: (value) => {
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) return "Enter a workspace name";
        if (trimmed.length > WORKSPACE_NAME_MAX) {
          return `Workspace name must be ${WORKSPACE_NAME_MAX} characters or fewer`;
        }
        if (!NO_HIDDEN_CHARS.test(trimmed)) {
          return "Contains characters that aren't allowed";
        }
        if (!NO_URL.test(trimmed)) {
          return "Workspace name cannot contain a URL";
        }
        return null;
      },
      slug: (value) => {
        if (!value) return "Enter a workspace URL";
        if (
          value.length < WORKSPACE_SLUG_MIN ||
          value.length > WORKSPACE_SLUG_MAX
        ) {
          return `URL must be between ${WORKSPACE_SLUG_MIN} and ${WORKSPACE_SLUG_MAX} characters`;
        }
        if (!WORKSPACE_SLUG_PATTERN.test(value)) {
          return "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen";
        }
        if (RESERVED_WORKSPACE_SLUGS.has(value)) {
          return "This URL is reserved. Choose another one.";
        }
        return null;
      },
      organizationSize: (value) => {
        if (!value || !ORGANIZATION_SIZES.includes(value)) {
          return "Select how many people will use this workspace";
        }
        return null;
      },
    },
  });

  const { status: slugStatus, markTaken } = useSlugAvailability(
    form.values.slug,
  );

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const newName = event.target.value;
    form.setFieldValue("name", newName);

    if (!slugTouched) {
      const generatedSlug = slugify(newName);
      form.setFieldValue("slug", generatedSlug);
    }
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    const rawValue = event.target.value;
    const normalized = normalizeSlugInput(rawValue);
    form.setFieldValue("slug", normalized);

    if (normalized === "") {
      setSlugTouched(false);
    } else {
      setSlugTouched(true);
    }
  }

  function handleSlugPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const extracted = extractSlugFromUrl(pasted);
    form.setFieldValue("slug", extracted);
    setSlugTouched(extracted !== "");
  }

  // Determine whether submit button should be enabled
  const trimmedName = form.values.name.trim();
  const isNameValid =
    trimmedName.length >= 1 &&
    trimmedName.length <= WORKSPACE_NAME_MAX &&
    NO_HIDDEN_CHARS.test(trimmedName) &&
    NO_URL.test(trimmedName);

  const isSlugFormatValid =
    form.values.slug.length >= WORKSPACE_SLUG_MIN &&
    form.values.slug.length <= WORKSPACE_SLUG_MAX &&
    WORKSPACE_SLUG_PATTERN.test(form.values.slug) &&
    !RESERVED_WORKSPACE_SLUGS.has(form.values.slug);

  const isSlugAvailable = slugStatus.kind !== "unavailable";

  const isOrgSizeSelected = Boolean(
    form.values.organizationSize &&
      ORGANIZATION_SIZES.includes(form.values.organizationSize),
  );

  const canSubmit =
    isNameValid &&
    isSlugFormatValid &&
    isSlugAvailable &&
    isOrgSizeSelected &&
    !isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneralError(null);

    const validation = form.validate();
    if (validation.hasErrors) return;

    setIsSubmitting(true);
    try {
      const created = await workspaceApi.create({
        name: trimmedName,
        slug: form.values.slug,
        organizationSize: form.values.organizationSize,
      });

      add(created);
      navigate(`/${created.slug}`, { replace: true });
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        if (error.status === 400 && error.fields) {
          form.setErrors(error.fields);
          return;
        }

        if (error.status === 409) {
          const conflictMsg =
            error.fields.slug || "This URL is already taken. Choose another one.";
          form.setFieldError("slug", conflictMsg);
          markTaken(form.values.slug);
          return;
        }

        if (error.status === 429) {
          const minutes = Math.max(
            1,
            Math.ceil((error.retryAfterSeconds ?? 60) / 60),
          );
          setGeneralError(
            `You've created several workspaces recently. Try again in ${minutes} minutes.`,
          );
          return;
        }

        if (error.status === 401) {
          expireSession();
          return;
        }

        setGeneralError(
          error.message || "Couldn't create the workspace. Please try again.",
        );
      } else {
        setGeneralError("Couldn't create the workspace. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    form,
    slugStatus,
    generalError,
    isSubmitting,
    canSubmit,
    handleNameChange,
    handleSlugChange,
    handleSlugPaste,
    handleSubmit,
  };
}

