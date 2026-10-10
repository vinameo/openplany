import { useMemo } from "react";
import {
  Button,
  Group,
  List,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  type PermissionItem,
  type RoleRef,
  PROJECT_ROLE_LABELS,
  WORKSPACE_ROLE_LABELS,
} from "@repo/contracts";

export interface PermissionDiffItem {
  role: RoleRef;
  granted: string[];
  revoked: string[];
}

interface ConfirmPermissionChangesModalProps {
  opened: boolean;
  onClose: () => void;
  diff: PermissionDiffItem[];
  onConfirm: () => void;
  isSaving: boolean;
  permissions?: readonly PermissionItem[] | Record<string, string> | ReadonlyMap<string, string>;
}

export function ConfirmPermissionChangesModal({
  opened,
  onClose,
  diff,
  onConfirm,
  isSaving,
  permissions,
}: ConfirmPermissionChangesModalProps) {
  const labelMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!permissions) return map;
    if (permissions instanceof Map) {
      for (const [k, v] of permissions.entries()) {
        map.set(k, String(v));
      }
      return map;
    }
    if (Array.isArray(permissions)) {
      for (const item of permissions) {
        if (item && typeof item === "object" && "key" in item && "label" in item) {
          map.set(item.key, item.label);
        }
      }
      return map;
    }
    if (typeof permissions === "object") {
      for (const [k, v] of Object.entries(permissions)) {
        map.set(k, String(v));
      }
    }
    return map;
  }, [permissions]);

  function getPermissionLabel(perm: string): string {
    return labelMap.get(perm) ?? perm;
  }

  function getRoleHeading(ref: RoleRef): string {
    if (ref.scope === "workspace") {
      return WORKSPACE_ROLE_LABELS[ref.key];
    }
    if (ref.key === "guest") {
      return "Guest (project)";
    }
    return PROJECT_ROLE_LABELS[ref.key];
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Save permission changes?"
      trapFocus
      returnFocus
    >
      <Stack gap="md">
        <Text size="sm">
          These changes apply to every workspace right away.
        </Text>

        <Stack gap="sm">
          {diff.map((item) => {
            const roleHeading = getRoleHeading(item.role);
            return (
              <div key={`${item.role.scope}.${item.role.key}`}>
                <Text size="sm" fw={600}>
                  {roleHeading}
                </Text>
                <List size="sm" withPadding>
                  {item.granted.map((perm) => (
                    <List.Item key={perm} c="green.7">
                      + {getPermissionLabel(perm)}
                    </List.Item>
                  ))}
                  {item.revoked.map((perm) => (
                    <List.Item key={perm} c="red.7">
                      − {getPermissionLabel(perm)}
                    </List.Item>
                  ))}
                </List>
              </div>
            );
          })}
        </Stack>

        <Group justify="flex-end" gap="sm" mt="md">
          <Button variant="default" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            loading={isSaving}
            disabled={isSaving}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
