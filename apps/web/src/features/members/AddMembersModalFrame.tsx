import { type ReactNode, useReducer, useState } from 'react';
import {
  Alert,
  Button,
  CloseButton,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ADD_MEMBERS_MAX } from '@repo/contracts';
import { ConfirmDiscardModal } from '../workspaces/ConfirmDiscardModal';
import { PlusIcon } from '../workspaces/icons';
import {
  addMemberRowsReducer,
  createInitialRow,
  toAddMembersRequest,
  type AddMemberRow,
  type AddMemberRowsAction,
  type RowFieldError,
  type RowsContext,
} from './addMembersRows';
import type { CandidateBase } from './MemberCandidateCombobox';
import type { RoleScheme } from './roleScheme';
import classes from './AddMembersModalFrame.module.css';

export type SubmitOutcome =
  | { kind: 'done' }
  | { kind: 'rowErrors'; byRowId: Record<string, RowFieldError> }
  | { kind: 'alert'; message: string };

export interface AddMembersModalFrameProps<
  R extends string,
  C extends CandidateBase,
> {
  opened: boolean;
  onClose: () => void;
  title?: string;
  description: ReactNode;
  scheme: RoleScheme<R>;
  defaultRole: R;
  rowsContext?: RowsContext<R, C>;
  roleOptionsFor: (row: AddMemberRow<R, C>) => readonly R[];
  renderCandidate: (
    row: AddMemberRow<R, C>,
    otherSelectedIds: readonly string[],
    onSelect: (candidate: C | null) => void,
  ) => ReactNode;
  notice?: (row: AddMemberRow<R, C>) => ReactNode | null;
  onSubmit: (
    body: { members: { userId: string; role: R }[] },
    rowIdByIndex: readonly string[],
  ) => Promise<SubmitOutcome>;
}

export function AddMembersModalFrame<
  R extends string,
  C extends CandidateBase,
>({
  opened,
  onClose,
  title = 'Add member',
  description,
  scheme,
  defaultRole,
  rowsContext,
  roleOptionsFor,
  renderCandidate,
  notice,
  onSubmit,
}: AddMembersModalFrameProps<R, C>) {
  const isMobile = useMediaQuery('(max-width: 48em)');

  const ctx: RowsContext<R, C> = rowsContext ?? { defaultRole };

  const [rows, dispatch] = useReducer(
    (currentRows: AddMemberRow<R, C>[], action: AddMemberRowsAction<R, C>) =>
      addMemberRowsReducer(currentRows, action, ctx),
    [createInitialRow<R, C>(defaultRole)],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalAlert, setGlobalAlert] = useState<string | null>(null);
  const [confirmDiscardOpened, setConfirmDiscardOpened] = useState(false);

  const handleAttemptClose = () => {
    const hasCandidate = rows.some((r) => r.candidate !== null);
    if (hasCandidate) {
      setConfirmDiscardOpened(true);
    } else {
      handleForceClose();
    }
  };

  const handleForceClose = () => {
    setConfirmDiscardOpened(false);
    setGlobalAlert(null);
    dispatch({ type: 'reset' });
    onClose();
  };

  const handleSubmit = async () => {
    const { body, rowIdByIndex } = toAddMembersRequest(rows);
    if (body.members.length === 0) return;

    setIsSubmitting(true);
    setGlobalAlert(null);

    try {
      const outcome = await onSubmit(body, rowIdByIndex);
      if (outcome.kind === 'done') {
        handleForceClose();
      } else if (outcome.kind === 'rowErrors') {
        dispatch({ type: 'errors', byRowId: outcome.byRowId });
      } else if (outcome.kind === 'alert') {
        setGlobalAlert(outcome.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasAnySelected = rows.some((r) => r.candidate !== null);

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleAttemptClose}
        title={title}
        size="lg"
        fullScreen={isMobile}
      >
        <Stack gap="md">
          {typeof description === 'string' ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : (
            description
          )}

          {globalAlert && (
            <Alert color="red" role="alert">
              {globalAlert}
            </Alert>
          )}

          <Stack gap="sm">
            {rows.map((row) => {
              const otherSelectedIds = rows
                .filter((r) => r.id !== row.id && r.candidate !== null)
                .map((r) => r.candidate!.userId);

              const roleOptions = [...roleOptionsFor(row)]
                .sort((a, b) => scheme.rank[a] - scheme.rank[b])
                .map((r) => ({
                  value: r,
                  label: scheme.labels[r],
                }));

              const rowNotice = notice?.(row);
              const roleNoticeId = row.roleNotice
                ? `role-notice-${row.id}`
                : undefined;
              const rowNoticeId = rowNotice ? `row-notice-${row.id}` : undefined;
              const roleErrorId = row.roleError
                ? `role-error-${row.id}`
                : undefined;
              const noticeText = row.roleNotice || rowNotice;
              const noticeId = roleNoticeId || rowNoticeId;

              return (
                <div key={row.id}>
                  <Group
                    gap="xs"
                    align="flex-start"
                    wrap={isMobile ? 'wrap' : 'nowrap'}
                  >
                    <div className={classes.candidateField}>
                      {renderCandidate(row, otherSelectedIds, (candidate) =>
                        dispatch({
                          type: 'select',
                          id: row.id,
                          candidate,
                        }),
                      )}
                    </div>

                    <Group gap="xs" wrap="nowrap" className={classes.roleGroup}>
                      <Select
                        aria-label="Role"
                        data={roleOptions}
                        value={row.role}
                        error={row.roleError}
                        errorProps={
                          roleErrorId ? { id: roleErrorId } : undefined
                        }
                        description={noticeText}
                        descriptionProps={
                          noticeId ? { id: noticeId } : undefined
                        }
                        inputWrapperOrder={[
                          'label',
                          'input',
                          'description',
                          'error',
                        ]}
                        onChange={(val) => {
                          if (val) {
                            dispatch({
                              type: 'role',
                              id: row.id,
                              role: val as R,
                            });
                          }
                        }}
                        disabled={isSubmitting}
                        comboboxProps={{ withinPortal: false }}
                        allowDeselect={false}
                        className={classes.roleSelect}
                      />

                      {rows.length > 1 && (
                        <CloseButton
                          aria-label="Remove row"
                          onClick={() =>
                            dispatch({ type: 'remove', id: row.id })
                          }
                          disabled={isSubmitting}
                          size="lg"
                        />
                      )}
                    </Group>
                  </Group>
                </div>
              );
            })}
          </Stack>

          {rows.length < ADD_MEMBERS_MAX && (
            <div>
              <Button
                variant="subtle"
                size="xs"
                leftSection={<PlusIcon width={14} height={14} />}
                onClick={() => dispatch({ type: 'add' })}
                disabled={isSubmitting}
              >
                + Add more
              </Button>
            </div>
          )}

          <Group justify="flex-end" gap="xs" mt="md">
            <Button
              variant="default"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasAnySelected || isSubmitting}
              loading={isSubmitting}
            >
              Add member
            </Button>
          </Group>
        </Stack>
      </Modal>

      <ConfirmDiscardModal
        opened={confirmDiscardOpened}
        onClose={() => setConfirmDiscardOpened(false)}
        onDiscard={handleForceClose}
      />
    </>
  );
}
