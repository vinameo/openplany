import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import {
  normalizeWorkItemDescription,
  normalizeWorkItemTitle,
  workItemDescriptionProblem,
  workItemTitleProblem,
  type ProjectListItem,
} from "@repo/contracts";
import { ApiRequestError, retryAfterMinutes } from "../../../lib/apiClient";
import { translateRef } from "../../../i18n/language";
import { useCreateWorkItem } from "../api/useCreateWorkItem";

export function createContentFingerprint(
  title: string,
  description: string,
): string {
  const normTitle = normalizeWorkItemTitle(title);
  const normDesc = normalizeWorkItemDescription(description);
  return JSON.stringify([normTitle, normDesc]);
}

export interface UseCreateWorkItemFormOptions {
  slug: string;
  project: ProjectListItem;
  onSuccess?: () => void;
  reloadProject?: () => void;
}

export function useCreateWorkItemForm({
  slug,
  project,
  onSuccess,
  reloadProject,
}: UseCreateWorkItemFormOptions) {
  const { t } = useTranslation();
  const createMutation = useCreateWorkItem();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaveLocked, setIsSaveLocked] = useState(false);
  const [createMore, setCreateMore] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Map of content fingerprint -> idempotency key for this modal session
  const idempotencyMapRef = useRef<Map<string, string>>(new Map());
  const isSubmittingRef = useRef(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setTitleError(null);
    setDescriptionError(null);
    setServerError(null);
    setIsSaveLocked(false);
    setCreateMore(false);
    idempotencyMapRef.current.clear();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (isSubmittingRef.current || createMutation.isPending || isSaveLocked) {
      return;
    }

    setServerError(null);

    const titleProb = workItemTitleProblem(title);
    if (titleProb) {
      setTitleError(translateRef(t, titleProb));
      return;
    }
    setTitleError(null);

    const descProb = workItemDescriptionProblem(description);
    if (descProb) {
      setDescriptionError(translateRef(t, descProb));
      return;
    }
    setDescriptionError(null);

    const normTitle = normalizeWorkItemTitle(title);
    const normDesc = normalizeWorkItemDescription(description);
    const fingerprint = createContentFingerprint(title, description);

    let key = idempotencyMapRef.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      idempotencyMapRef.current.set(fingerprint, key);
    }

    isSubmittingRef.current = true;

    try {
      const res = await createMutation.mutateAsync({
        slug,
        identifier: project.identifier,
        body: {
          title: normTitle,
          description: normDesc,
          idempotencyKey: key,
        },
      });

      notifications.show({
        title: t("workItem:create.created", { key: res.workItem.key }),
        message: res.workItem.title,
      });

      // Clear the map on success for next creation
      idempotencyMapRef.current.clear();

      if (createMore) {
        setTitle("");
        setDescription("");
        setTitleError(null);
        setDescriptionError(null);
        setServerError(null);
        titleInputRef.current?.focus();
      } else {
        onSuccess?.();
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 403) {
          setServerError(t("workItem:errors.createForbidden"));
          setIsSaveLocked(true);
          reloadProject?.();
        } else if (err.status === 404) {
          setServerError(t("workItem:errors.projectGone"));
          setIsSaveLocked(true);
        } else if (err.status === 429) {
          setServerError(
            t("workItem:errors.tooManyRequests", {
              count: retryAfterMinutes(err.retryAfterSeconds),
            }),
          );
        } else if (err.code === "WORK_ITEM_REQUEST_REUSED") {
          // Bỏ khoá của dấu vân hiện tại, nội dung giữ
          idempotencyMapRef.current.delete(fingerprint);
          setServerError(t("workItem:errors.requestReused"));
        } else if (err.status === 400 && err.fields) {
          let fieldMatched = false;
          if (err.fields.title) {
            setTitleError(err.fields.title);
            fieldMatched = true;
          }
          if (err.fields.description) {
            setDescriptionError(err.fields.description);
            fieldMatched = true;
          }
          if (err.fields.idempotencyKey) {
            idempotencyMapRef.current.delete(fingerprint);
          }
          if (!fieldMatched) {
            setServerError(t("workItem:errors.generic"));
          }
        } else {
          // Network errors, 413, 415, 5xx: keep key in map
          setServerError(t("workItem:errors.generic"));
        }
      } else {
        // Network or fetch exceptions: keep key in map
        setServerError(t("workItem:errors.generic"));
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const hasChanges = title.length > 0 || description.length > 0;
  const isSaving = createMutation.isPending;

  return {
    title,
    setTitle: (val: string) => {
      setTitle(val);
      if (titleError) setTitleError(null);
    },
    description,
    setDescription: (val: string) => {
      setDescription(val);
      if (descriptionError) setDescriptionError(null);
    },
    titleError,
    descriptionError,
    serverError,
    isSaving,
    isSaveLocked,
    createMore,
    setCreateMore,
    titleInputRef,
    hasChanges,
    handleSubmit,
    resetForm,
    idempotencyMapRef,
  };
}
