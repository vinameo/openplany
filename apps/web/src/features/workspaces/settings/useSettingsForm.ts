import {
  useMemo,
  useState,
} from "react";
import {
  useForm,
  type FormValidateInput,
  type UseFormReturnType,
} from "@mantine/form";
import { pickChangedFields } from "@repo/contracts";
import { ApiRequestError } from "../../../lib/apiClient";
import { useAuth } from "../../auth/useAuth";

export interface UseSettingsFormOptions<
  V extends Record<string, unknown>,
  K extends keyof V & string,
> {
  source: V;
  sourceVersion: string;
  fields: readonly K[];
  normalize?: Partial<{ [F in K]: (value: V[F]) => V[F] }>;
  validate?: Partial<{ [F in K]: (value: V[F]) => string | null }>;
  submit: (changes: Partial<Pick<V, K>>) => Promise<V>;
  onApiError?: (error: ApiRequestError) => string | null;
}

export function useSettingsForm<
  V extends Record<string, unknown>,
  K extends keyof V & string,
>({
  source,
  sourceVersion,
  fields,
  normalize,
  validate,
  submit,
  onApiError,
}: UseSettingsFormOptions<V, K>): {
  form: UseFormReturnType<V>;
  changes: Partial<Pick<V, K>>;
  hasChanges: boolean;
  isSaving: boolean;
  submitError: string | null;
  setSubmitError: (error: string | null) => void;
  handleSubmit: ReturnType<UseFormReturnType<V>["onSubmit"]>;
} {
  const { expireSession } = useAuth();

  const [initial, setInitial] = useState<V>(() => ({ ...source }));
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<V>({
    mode: "controlled",
    initialValues: initial,
    validateInputOnBlur: true,
    validate: validate as unknown as FormValidateInput<V>,
  });

  // Keep track of sourceVersion changes: if form is clean, reload source
  const [prevVersion, setPrevVersion] = useState(sourceVersion);
  if (prevVersion !== sourceVersion) {
    setPrevVersion(sourceVersion);
    if (!form.isDirty()) {
      setInitial({ ...source });
      form.setInitialValues({ ...source });
      form.reset();
    }
  }

  const currentNormalized = useMemo(() => {
    const res = { ...form.values };
    for (const field of fields) {
      if (normalize?.[field]) {
        res[field] = normalize[field]!(res[field]);
      }
    }
    return res;
  }, [form.values, fields, normalize]);

  const initialNormalized = useMemo(() => {
    const res = { ...initial };
    for (const field of fields) {
      if (normalize?.[field]) {
        res[field] = normalize[field]!(res[field]);
      }
    }
    return res;
  }, [initial, fields, normalize]);

  const changes = useMemo(
    () => pickChangedFields(initialNormalized, currentNormalized, fields),
    [initialNormalized, currentNormalized, fields],
  );

  const hasChanges = Object.keys(changes).length > 0;

  function focusFirstError(errors: Record<string, unknown>): void {
    const first = fields.find((field) => field in errors);
    if (first !== undefined) {
      form.getInputNode(first)?.focus();
    }
  }

  async function save(): Promise<void> {
    setSubmitError(null);
    setIsSaving(true);
    try {
      const saved = await submit(changes);
      setInitial({ ...saved });
      form.setInitialValues({ ...saved });
      form.reset();
    } catch (error: unknown) {
      if (!(error instanceof ApiRequestError)) {
        console.error("Settings update failed unexpectedly", error);
        setSubmitError("An unexpected error occurred. Please try again.");
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

      if (onApiError) {
        const customMessage = onApiError(error);
        if (customMessage !== null) {
          setSubmitError(customMessage);
        }
      } else {
        setSubmitError(error.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const handleSubmit = form.onSubmit(() => void save(), focusFirstError);

  return {
    form,
    changes,
    hasChanges,
    isSaving,
    submitError,
    setSubmitError,
    handleSubmit,
  };
}
