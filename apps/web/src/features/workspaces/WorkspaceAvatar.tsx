import { Avatar, type AvatarProps } from "@mantine/core";

interface WorkspaceAvatarProps extends Omit<AvatarProps, "children"> {
  name: string;
  backgroundColor: string;
  size?: number | string;
}

export function WorkspaceAvatar({
  name,
  backgroundColor,
  size = 28,
  ...others
}: WorkspaceAvatarProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "W";

  return (
    <Avatar
      radius="sm"
      variant="filled"
      size={size}
      styles={{
        root: {
          backgroundColor,
          color: "#FFFFFF",
          fontWeight: 600,
          border: "1px solid var(--app-color-border, rgba(255, 255, 255, 0.1))",
        },
      }}
      {...others}
    >
      {initial}
    </Avatar>
  );
}

