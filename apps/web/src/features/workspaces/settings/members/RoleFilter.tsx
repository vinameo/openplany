import {
  Button,
  Checkbox,
  Group,
  Popover,
  Stack,
  Text,
} from "@mantine/core";
import {
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "@repo/contracts";
import { FilterIcon } from "../../icons";

interface RoleFilterProps {
  selectedRoles: readonly WorkspaceRole[];
  onChange: (roles: WorkspaceRole[]) => void;
}

export function RoleFilter({ selectedRoles, onChange }: RoleFilterProps) {
  const label =
    selectedRoles.length > 0
      ? `Filters · ${selectedRoles.length}`
      : "Filters";

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
            value={selectedRoles as string[]}
            onChange={(vals) => onChange(vals as WorkspaceRole[])}
          >
            <Stack gap="xs">
              {WORKSPACE_ROLES.map((role) => (
                <Checkbox
                  key={role}
                  value={role}
                  label={WORKSPACE_ROLE_LABELS[role]}
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
