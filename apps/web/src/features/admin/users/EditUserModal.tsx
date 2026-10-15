import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Skeleton, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { AdminUserResponse } from "@repo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DiscardChangesFooter } from "../../layout/DiscardChangesFooter";
import { useDiscardGuard } from "../../layout/useDiscardGuard";
import { adminUserKeys, adminUserQueries } from "./api/adminUserQueries";
import { parseAdminUserError } from "./adminUserErrors";
import { useAdminUserErrorRecovery } from "./useAdminUserErrorRecovery";
import { useEditUserForm } from "./useEditUserForm";
import { EditUserForm } from "./EditUserForm";
import classes from "./EditUserModal.module.css";

export interface EditUserModalProps {
  opened: boolean;
  user: AdminUserResponse | null;
  onClose: () => void;
  onSaved?: (user: AdminUserResponse) => void;
}

interface EditUserModalFormContentProps {
  loadedUser: AdminUserResponse;
  onClose: () => void;
  onSaved?: (user: AdminUserResponse) => void;
  refetchDetail: () => Promise<{ data?: AdminUserResponse }>;
  requestCloseRef: { current: () => void };
}

function EditUserModalFormContent({
  loadedUser,
  onClose,
  onSaved,
  refetchDetail,
  requestCloseRef,
}: EditUserModalFormContentProps) {
  const { t } = useTranslation();
  const [isReloading, setIsReloading] = useState(false);

  const formState = useEditUserForm({
    loadedUser,
    onSaved: onSaved ?? (() => {}),
    onClose,
  });

  const { isConfirmingDiscard, keepEditingRef, requestClose, cancelDiscard } =
    useDiscardGuard({
      hasChanges: formState.hasChanges,
      isSaving: formState.isSubmitting,
      onDiscard: onClose,
    });

  useEffect(() => {
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = onClose;
    };
  }, [requestClose, onClose, requestCloseRef]);

  async function handleReload() {
    setIsReloading(true);
    try {
      const result = await refetchDetail();
      if (result.data) {
        formState.handleReload(result.data);
      }
    } finally {
      setIsReloading(false);
    }
  }

  const footer = isConfirmingDiscard ? (
    <DiscardChangesFooter
      keepEditingRef={keepEditingRef}
      onKeepEditing={cancelDiscard}
      onDiscard={onClose}
      className={classes.footer}
    />
  ) : (
    <div className={classes.actions}>
      <Button
        type="submit"
        variant="filled"
        loading={formState.isSubmitting}
        disabled={!formState.hasChanges || !formState.form.isValid()}
      >
        {t("common:actions.saveChanges")}
      </Button>
      <Button
        type="button"
        variant="default"
        onClick={requestClose}
        disabled={formState.isSubmitting}
      >
        {t("common:actions.cancel")}
      </Button>
    </div>
  );

  return (
    <EditUserForm
      state={formState}
      onCancel={requestClose}
      onReload={handleReload}
      isReloading={isReloading}
      footer={footer}
    />
  );
}

function EditUserModalContent({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserResponse;
  onClose: () => void;
  onSaved?: (user: AdminUserResponse) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isNarrow = useMediaQuery("(max-width: 575px)");
  const [openedAt] = useState(() => Date.now());
  const requestCloseRef = useRef<() => void>(onClose);
  const { forgetMissingUser, refreshSessionAfterForbidden, expireSession } =
    useAdminUserErrorRecovery();

  // Clear detail query cache on mount to ensure fresh fetch (RQ D23, AC-38)
  useEffect(() => {
    queryClient.removeQueries({ queryKey: adminUserKeys.detail(user.id) });
  }, [user.id, queryClient]);

  const { data, error, refetch, dataUpdatedAt } = useQuery({
    ...adminUserQueries.detail(user.id),
    refetchOnMount: "always",
  });

  const queryErrorAction = useMemo(() => {
    if (!error) return null;
    return parseAdminUserError(error, "detail");
  }, [error]);

  // Load errors shared with the other screens (B2.7). 404 closes with a
  // toast (AC-12); 403 refreshes the session; 401 signs out. Keyed on the
  // error only, so a parent re-render never repeats the refresh.
  useEffect(() => {
    if (queryErrorAction?.type === "forbidden") {
      void refreshSessionAfterForbidden();
    } else if (queryErrorAction?.type === "expireSession") {
      expireSession();
    }
  }, [queryErrorAction, refreshSessionAfterForbidden, expireSession]);

  useEffect(() => {
    if (queryErrorAction?.type === "userNotFound") {
      forgetMissingUser(user.id, queryErrorAction.message);
      onClose();
    }
  }, [queryErrorAction, user.id, onClose, forgetMissingUser]);

  const isFresh = Boolean(data && dataUpdatedAt >= openedAt);
  const loadedUser = isFresh && data ? data : null;

  return (
    <Modal
      opened
      onClose={() => requestCloseRef.current()}
      title={t("admin:users.edit.title")}
      size="lg"
      radius="lg"
      padding="xl"
      fullScreen={isNarrow}
      closeButtonProps={{
        "aria-label": t("common:actions.close"),
      }}
    >
      {error && queryErrorAction?.type !== "userNotFound" ? (
        <Alert color="red" title={t("common:error")} role="alert">
          <Text size="sm" mb="xs">
            {queryErrorAction?.type === "rateLimit" ||
            queryErrorAction?.type === "forbidden"
              ? queryErrorAction.message
              : t("admin:users.errors.loadUserFailed")}
          </Text>
          <Button variant="default" size="xs" onClick={() => refetch()}>
            {t("common:actions.tryAgain")}
          </Button>
        </Alert>
      ) : loadedUser ? (
        <EditUserModalFormContent
          loadedUser={loadedUser}
          onClose={onClose}
          onSaved={onSaved}
          refetchDetail={refetch}
          requestCloseRef={requestCloseRef}
        />
      ) : (
        <div className={classes.skeletonGroup} data-testid="edit-user-skeleton">
          <div className={classes.row}>
            <Skeleton height={56} radius="sm" />
            <Skeleton height={56} radius="sm" />
          </div>
          <div className={classes.row}>
            <Skeleton height={56} radius="sm" />
            <Skeleton height={56} radius="sm" />
          </div>
          <div className={classes.actions}>
            <Button variant="filled" disabled>
              {t("common:actions.saveChanges")}
            </Button>
            <Button variant="default" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function EditUserModal({
  opened,
  user,
  onClose,
  onSaved,
}: EditUserModalProps) {
  if (!opened || !user) {
    return null;
  }

  return (
    <EditUserModalContent
      key={user.id}
      user={user}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
