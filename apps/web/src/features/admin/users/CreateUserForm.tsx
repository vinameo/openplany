import type { ReactNode } from 'react';
import { Alert, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  type CreateUserFormState,
  useCreateUserForm,
} from './useCreateUserForm';
import { DisplayNameField, UserNameFields } from './form/UserNameFields';
import { EmailField } from './form/EmailField';
import { NewPasswordFields } from '../../passwords/NewPasswordFields';
import classes from './CreateUserForm.module.css';

export interface CreateUserFormProps {
  state?: CreateUserFormState;
  onSuccess?: () => void;
  onCancel?: () => void;
  footer?: ReactNode;
}

function CreateUserFormView({
  state,
  onCancel,
  footer,
}: {
  state: CreateUserFormState;
  onCancel?: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const { form, isSubmitting, submitError, handleSubmit } = state;

  return (
    <div className={classes.container}>
      <form
        onSubmit={handleSubmit}
        noValidate
        autoComplete="off"
        className={classes.form}
      >
        <UserNameFields form={form} readOnly={isSubmitting} autoFocus />

        <div className={classes.row}>
          <DisplayNameField form={form} readOnly={isSubmitting} />
          <EmailField form={form} readOnly={isSubmitting} />
        </div>

        <NewPasswordFields
          passwordProps={form.getInputProps('password')}
          confirmProps={form.getInputProps('confirmPassword')}
          passwordLabel={t('admin:users.form.password')}
          confirmLabel={t('admin:users.form.confirmPassword')}
          readOnly={isSubmitting}
        />
        {submitError && (
          <Alert color="red" title={t('common:error')} role="alert">
            {submitError}
          </Alert>
        )}

        {footer ?? (
          <div className={classes.actions}>
            <Button
              type="submit"
              variant="filled"
              loading={isSubmitting}
              disabled={!form.isValid()}
            >
              {t('admin:users.form.submit')}
            </Button>

            {onCancel && (
              <Button
                type="button"
                variant="default"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                {t('common:actions.cancel')}
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function CreateUserFormWithInternalState({
  onSuccess,
  onCancel,
  footer,
}: CreateUserFormProps) {
  const state = useCreateUserForm({
    onCreated: onSuccess ?? (() => {}),
  });

  return (
    <CreateUserFormView
      state={state}
      onCancel={onCancel}
      footer={footer}
    />
  );
}

export function CreateUserForm(props: CreateUserFormProps = {}) {
  if (props.state) {
    return (
      <CreateUserFormView
        state={props.state}
        onCancel={props.onCancel}
        footer={props.footer}
      />
    );
  }

  return <CreateUserFormWithInternalState {...props} />;
}
