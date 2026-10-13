import { useMemo } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Popover,
  Stack,
  Text,
} from '@mantine/core';
import { FilterIcon } from '../workspaces/icons';
import type { RoleScheme } from './roleScheme';

export interface RoleFilterProps<R extends string> {
  scheme: RoleScheme<R>;
  selectedRoles: readonly R[];
  onChange: (roles: R[]) => void;
}

export function RoleFilter<R extends string>({
  scheme,
  selectedRoles,
  onChange,
}: RoleFilterProps<R>) {
  const label =
    selectedRoles.length > 0
      ? `Filters · ${selectedRoles.length}`
      : 'Filters';

  const sortedRoles = useMemo(
    () => [...scheme.roles].sort((a, b) => scheme.rank[b] - scheme.rank[a]),
    [scheme],
  );

  return (
    <Popover
      position="bottom-start"
      withArrow
      shadow="md"
      withinPortal={false}
    >
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<FilterIcon width={14} height={14} />}
          aria-label="Filter by role"
        >
          {label}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <Stack gap="xs">
          <Group justify="space-between" align="center">
            <Text size="xs" fw={600} c="dimmed">
              Role
            </Text>
            {selectedRoles.length > 0 && (
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            )}
          </Group>
          <Checkbox.Group
            value={selectedRoles as unknown as string[]}
            onChange={(vals) => onChange(vals as unknown as R[])}
          >
            <Stack gap="xs">
              {sortedRoles.map((role) => (
                <Checkbox
                  key={role}
                  value={role}
                  label={scheme.labels[role]}
                  size="sm"
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
