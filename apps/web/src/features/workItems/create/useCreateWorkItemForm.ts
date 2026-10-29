import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
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
import { stateKeys } from "../../states/api/stateQueries";
import { priorityKeys } from "../../priorities/api/priorityQueries";

export interface ContentFingerprintInput {
  title: string;
  description: string;
  stateId?: string | null;
  priorityId?: string | null;
}

export function createContentFingerprint(
  inputOrTitle: ContentFingerprintInput | string,
  description?: string,
  stateId?: string | null,
  priorityId?: string | null,
): string {
  let title: string;
  let desc: string;
  let sId: string | null | undefined;
  let pId: string | null | undefined;

  if (typeof inputOrTitle === "object" && inputOrTitle !== null) {
    title = inputOrTitle.title;
    desc = inputOrTitle.description;
    sId = inputOrTitle.stateId;
    pId = inputOrTitle.priorityId;
  } else {
    title = inputOrTitle;
    desc = description ?? "";
    sId = stateId;
    pId = priorityId;
  }

  const normTitle = normalizeWorkItemTitle(title);
  const normDesc = normalizeWorkItemDescription(desc);
  return JSON.stringify([normTitle, normDesc, sId ?? "", pId ?? ""]);
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
  const queryClient = useQueryClient();
  const createMutation = useCreateWorkItem();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedPriorityId, setSelectedPriorityId] = useState<string | null>(
    null,
  );
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
    setSelectedStateId(null);
    setSelectedPriorityId(null);
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
    const fingerprint = createContentFingerprint({
      title,
      description,
      stateId: selectedStateId,
      priorityId: selectedPriorityId,
    });

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
          ...(selectedStateId ? { stateId: selectedStateId } : {}),
          ...(selectedPriorityId ? { priorityId: selectedPriorityId } : {}),
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
        setSelectedStateId(null);
        setSelectedPriorityId(null);
        setTitleError(null);
        setDescriptionError(null);
        setServerError(null);
        titleInputRef.current?.focus();
      } else {
        onSuccess?.();
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // Pick by code (WEB B2.5): another 403/404 (e.g. ORIGIN_NOT_ALLOWED) must not lock Save
        if (err.code === "FORBIDDEN") {
          setServerError(t("workItem:errors.createForbidden"));
          setIsSaveLocked(true);
          reloadProject?.();
        } else if (err.code === "PROJECT_NOT_FOUND") {
          setServerError(t("workItem:errors.projectGone"));
          setIsSaveLocked(true);
        } else if (err.code === "TOO_MANY_ATTEMPTS") {
          setServerError(
            t("workItem:errors.tooManyRequests", {
              count: retryAfterMinutes(err.retryAfterSeconds),
            }),
          );
        } else if (err.code === "WORK_ITEM_REQUEST_REUSED") {
          // Bỏ khoá của dấu vân hiện tại, nội dung giữ
          idempotencyMapRef.current.delete(fingerprint);
          setServerError(t("workItem:errors.requestReused"));
        } else if (err.code === "STATE_UNAVAILABLE") {
          setSelectedStateId(null);
          idempotencyMapRef.current.delete(fingerprint);
          setServerError(t("workItem:errors.stateUnavailable"));
          queryClient.invalidateQueries({
            queryKey: stateKeys.project(slug, project.identifier),
          });
        } else if (err.code === "PRIORITY_UNAVAILABLE") {
          setSelectedPriorityId(null);
          idempotencyMapRef.current.delete(fingerprint);
          setServerError(t("workItem:errors.priorityUnavailable"));
          queryClient.invalidateQueries({
            queryKey: priorityKeys.project(slug, project.identifier),
          });
        } else if (err.code === "VALIDATION_ERROR") {
          let fieldMatched = false;
          if (err.fields.title) {
            setTitleError(err.fields.title);
            fieldMatched = true;
          }
          if (err.fields.description) {
            setDescriptionError(err.fields.description);
            fieldMatched = true;
          }
          if (err.fields.priorityId) {
            setSelectedPriorityId(null);
            idempotencyMapRef.current.delete(fingerprint);
            setServerError(t("workItem:errors.priorityInvalid"));
            queryClient.invalidateQueries({
              queryKey: priorityKeys.project(slug, project.identifier),
            });
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

  const hasChanges =
    title.length > 0 ||
    description.length > 0 ||
    selectedStateId !== null ||
    selectedPriorityId !== null;
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
    selectedStateId,
    setSelectedStateId,
    selectedPriorityId,
    setSelectedPriorityId,
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
