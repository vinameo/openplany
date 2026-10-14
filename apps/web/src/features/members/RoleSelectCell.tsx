import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Select, Stack, Text } from "@mantine/core";
import type { MessageKey } from "@repo/contracts";
import { roleSelectLabel } from "./membersMessages";

export interface RoleSelectCellProps<R extends string> {
  ref?: Ref<HTMLInputElement>;
  value: R;
  options: readonly R[];
  labels: Readonly<Record<R, string>>;
  /** Catalog key of each role's one-line description, shown under its option. */
  descriptionKeys?: Readonly<Partial<Record<R, MessageKey>>>;
  description?: string | null;
  memberName: string;
  disabled?: boolean;
  onRequestChange(next: R): void;
}

export function RoleSelectCell<R extends string>({
  ref,
  value,
  options,
  labels,
  descriptionKeys,
  description,
  memberName,
  disabled,
  onRequestChange,
}: RoleSelectCellProps<R>) {
  const { t } = useTranslation();
  const hasValue = options.includes(value);

  const data = useMemo(() => {
    const items = options.map((r) => ({
      value: r,
      label: labels[r] ?? r,
      disabled: false,
    }));
    if (!hasValue) {
      items.unshift({
        value,
        label: labels[value] ?? value,
        disabled: true,
      });
    }
    return items;
  }, [options, labels, value, hasValue]);

  return (
    <Select
      ref={ref}
      value={value}
      data={data}
      allowDeselect={false}
      comboboxProps={{ withinPortal: true }}
      searchable={false}
      disabled={disabled}
      description={description ?? undefined}
      aria-label={roleSelectLabel(memberName)}
      onChange={(next) => {
        if (next && next !== value) {
          onRequestChange(next as R);
        }
      }}
      renderOption={({ option }) => {
        const descKey = descriptionKeys?.[option.value as R];
        const desc = descKey ? t(descKey) : null;
        return (
          <Stack gap={2}>
            <Text size="sm">{option.label}</Text>
            {desc ? (
              <Text size="xs" c="dimmed">
                {desc}
              </Text>
            ) : null}
          </Stack>
        );
      }}
    />
  );
}
