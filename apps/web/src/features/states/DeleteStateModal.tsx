import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { StateResponse } from "@repo/contracts";
import { parseStateError } from "./stateErrors";
import { StateGroupIcon } from "./StateGroupIcon";

export interface DeleteStateModalProps {
  opened: boolean;
  targetState: StateResponse | null;
  availableStates: StateResponse[];
  isPending?: boolean;
  onConfirm: (
    targetStateId: string,
    replacementStateId?: string,
  ) => Promise<void>;
  onCancel: () => void;
  onRefetch: () => Promise<void>;
  onNotFound?: (message: string) => void;
}

function DeleteStateModalContent({
  opened,
  targetState,
  availableStates,
  isPending = false,
  onConfirm,
  onCancel,
  onRefetch,
  onNotFound,
}: DeleteStateModalProps & { targetState: StateResponse }) {
  const { t } = useTranslation();
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Filter available replacement options (excluding the target state itself per INV-08)
  const replacementOptions = useMemo(() => {
    return availableStates.filter((s) => s.id !== targetState.id);
  }, [availableStates, targetState.id]);

  // Compute default replacement: default state of the SAME group as target
  const defaultReplacementId = useMemo(() => {
    const sameGroupDefault = replacementOptions.find(
      (s) => s.level === "default" && s.group === targetState.group,
    );
    if (sameGroupDefault) return sameGroupDefault.id;
    const sameGroupAny = replacementOptions.find(
      (s) => s.group === targetState.group,
    );
    if (sameGroupAny) return sameGroupAny.id;
    return replacementOptions[0]?.id ?? null;
  }, [replacementOptions, targetState.group]);

  const [forceSelectMode, setForceSelectMode] = useState(false);
  const [selectedReplacementId, setSelectedReplacementId] = useState<
    string | null
  >(defaultReplacementId);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);

  const targetCount = targetState.workItemCount ?? 0;
  const isSelectMode = targetCount > 0 || forceSelectMode;

  useEffect(() => {
    if (opened) {
      requestAnimationFrame(() => {
        cancelBtnRef.current?.focus();
      });
    }
  }, [opened]);

  const selectData = useMemo(() => {
    return replacementOptions.map((s) => ({
      value: s.id,
      label: s.name,
    }));
  }, [replacementOptions]);

  const handleConfirm = async () => {
    setErrorAlert(null);
    try {
      await onConfirm(
        targetState.id,
        isSelectMode ? (selectedReplacementId ?? undefined) : undefined,
      );
    } catch (err: unknown) {
      const parsed = parseStateError(err, t);
      if (parsed.isReplacementRequired) {
        setForceSelectMode(true);
        await onRefetch();
        setErrorAlert(t("state:errors.replacementRequired"));
        return;
      }
      if (parsed.isReplacementInvalid) {
        await onRefetch();
        setSelectedReplacementId(null);
        setErrorAlert(t("state:errors.replacementInvalid"));
        return;
      }
      if (parsed.isNotFound) {
        onCancel();
        await onRefetch();
        onNotFound?.(t("state:errors.notFound"));
        return;
      }
      setErrorAlert(parsed.message ?? t("state:errors.generic"));
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={isPending ? () => {} : onCancel}
      title={t("state:delete.title", { name: targetState.name })}
      centered
      closeOnClickOutside={!isPending}
      closeOnEscape={!isPending}
      data-testid="delete-state-modal"
    >
      <Stack gap="md">
        {errorAlert && (
          <Alert
            color="red"
            role="alert"
            withCloseButton
            onClose={() => setErrorAlert(null)}
            data-testid="delete-state-error-alert"
          >
            {errorAlert}
          </Alert>
        )}

        {isSelectMode ? (
          <>
            <Text size="sm">
              {t("state:delete.moveTo", { count: targetCount })}
            </Text>
            <Select
              data={selectData}
              value={selectedReplacementId}
              onChange={setSelectedReplacementId}
              disabled={isPending}
              placeholder={t("state:errors.replacementInvalidFormat")}
              data-testid="delete-state-replacement-select"
              renderOption={({ option }) => {
                const s = replacementOptions.find((o) => o.id === option.value);
                return (
                  <Group gap="xs">
                    {s && (
                      <StateGroupIcon
                        group={s.group}
                        color={s.color}
                        size={14}
                      />
                    )}
                    <span>{option.label}</span>
                  </Group>
                );
              }}
            />
          </>
        ) : (
          <Text size="sm">{t("state:delete.empty")}</Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button
            ref={cancelBtnRef}
            variant="default"
            disabled={isPending}
            onClick={onCancel}
            data-testid="delete-state-cancel-button"
          >
            {t("state:form.cancel")}
          </Button>
          <Button
            color="red"
            loading={isPending}
            disabled={isPending || (isSelectMode && !selectedReplacementId)}
            onClick={handleConfirm}
            data-testid="delete-state-confirm-button"
          >
            {t("state:delete.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function DeleteStateModal(props: DeleteStateModalProps) {
  if (!props.targetState) {
    return null;
  }
  return (
    <DeleteStateModalContent
      key={props.targetState.id}
      {...props}
      targetState={props.targetState}
    />
  );
}
