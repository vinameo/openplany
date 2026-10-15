import { Alert, Button, Modal, PasswordInput, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { AdminUserResponse } from '@repo/contracts';
import { useTranslation } from 'react-i18next';
import { DiscardChangesFooter } from '../../layout/DiscardChangesFooter';
import { useDiscardGuard } from '../../layout/useDiscardGuard';
import { NewPasswordFields } from './form/NewPasswordFields';
import { useChangePasswordForm } from './useChangePasswordForm';
import { adminUserLabel } from './userFieldValidation';
import classes from './ChangePasswordModal.module.css';

export interface ChangePasswordModalProps {
  opened: boolean;
  user: AdminUserResponse | null;
  onClose: () => void;
  onSuccess?: () => void;
}

function ChangePasswordModalContent({
  user,
  opened,
  onClose,
  onSuccess,
}: {
  user: AdminUserResponse;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const isNarrow = useMediaQuery('(max-width: 575px)');
  const name = adminUserLabel(user);

  const {
    form,
    isSubmitting,
    submitError,
    hasChanges,
    needsActorPassword,
    handleSubmit,
  } = useChangePasswordForm({
      targetUser: user,
      onSuccess: onSuccess ?? (() => {}),
      onClose,
    });

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
        disabled={!hasChanges || !form.isValid()}
      >
        {t('admin:users.password.submit')}
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
      title={t('admin:users.password.title')}
      size="md"
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
      <form
        onSubmit={handleSubmit}
        noValidate
        autoComplete="off"
        className={classes.form}
      >
        <Text size="sm" c="dimmed">
          {t('admin:users.password.for', { name, email: user.email })}
        </Text>

        <NewPasswordFields form={form} readOnly={isSubmitting} />

        {needsActorPassword && (
          <PasswordInput
            label={t('admin:users.password.actorPassword')}
            description={t('admin:users.password.actorPasswordDescription', {
              name,
            })}
            withAsterisk
            autoComplete="current-password"
            visibilityToggleButtonProps={{
              'aria-label': t('admin:users.form.showPassword'),
            }}
            readOnly={isSubmitting}
            {...form.getInputProps('actorPassword')}
            key={form.key('actorPassword')}
          />
        )}

        <Text size="sm" c="dimmed">
          {t('admin:users.password.lockoutNote', { name })}
        </Text>

        {submitError && (
          <Alert color="red" title={t('common:error')} role="alert">
            {submitError}
          </Alert>
        )}

        {footer}
      </form>
    </Modal>
  );
}

export function ChangePasswordModal({
  opened,
  user,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  if (!user) {
    return null;
  }

  return (
    <ChangePasswordModalContent
      key={user.id}
      user={user}
      opened={opened}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
