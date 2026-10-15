import { Button, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DiscardChangesFooter } from '../../layout/DiscardChangesFooter';
import { useDiscardGuard } from '../../layout/useDiscardGuard';
import { invalidateAdminUserLists } from './api/adminUserQueries';
import { CreateUserForm } from './CreateUserForm';
import { useCreateUserForm } from './useCreateUserForm';
import classes from './CreateUserModal.module.css';

export interface CreateUserModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

function CreateUserModalContent({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isNarrow = useMediaQuery('(max-width: 575px)');

  function handleSuccess() {
    invalidateAdminUserLists(queryClient);
    onCreated?.();
    onClose();
  }

  const formState = useCreateUserForm({
    onCreated: handleSuccess,
  });
  const { form, isSubmitting, hasChanges } = formState;

  const { isConfirmingDiscard, keepEditingRef, requestClose, cancelDiscard } =
    useDiscardGuard({
      hasChanges,
      isSaving: isSubmitting,
      onDiscard: onClose,
    });

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
        loading={isSubmitting}
        disabled={!form.isValid()}
      >
        {t('admin:users.form.submit')}
      </Button>
      <Button
        type="button"
        variant="default"
        onClick={requestClose}
        disabled={isSubmitting}
      >
        {t('common:actions.cancel')}
      </Button>
    </div>
  );

  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title={t('admin:users.modal.createTitle')}
      size="lg"
      radius="lg"
      padding="xl"
      fullScreen={isNarrow}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      closeButtonProps={{
        disabled: isSubmitting,
        'aria-label': t('common:actions.close'),
      }}
    >
      <CreateUserForm state={formState} footer={footer} />
    </Modal>
  );
}

export function CreateUserModal({
  opened,
  onClose,
  onCreated,
}: CreateUserModalProps) {
  if (!opened) {
    return null;
  }

  return (
    <CreateUserModalContent
      opened={opened}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}
