import { Box, Group, Text, Title } from "@mantine/core";
import type { WorkspaceResponse } from "@repo/contracts";
import { WorkspaceAvatar } from "../../WorkspaceAvatar";

interface WorkspaceIdentityCardProps {
  workspace: WorkspaceResponse;
}

export function WorkspaceIdentityCard({
  workspace,
}: WorkspaceIdentityCardProps) {
  const host =
    typeof window !== "undefined" && window.location?.host
      ? window.location.host
      : "";
  const displayUrl = `${host}/${workspace.slug}`;

  return (
    <Group gap={16} wrap="nowrap" align="center">
      <WorkspaceAvatar
        name={workspace.name}
        backgroundColor={workspace.backgroundColor}
        size={64}
      />
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Title
          order={3}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={workspace.name}
        >
          {workspace.name}
        </Title>
        <Text
          size="sm"
          c="dimmed"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayUrl}
        </Text>
      </Box>
    </Group>
  );
}

