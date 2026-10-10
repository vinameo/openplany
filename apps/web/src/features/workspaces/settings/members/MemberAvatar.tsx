import { Avatar } from "@mantine/core";

interface MemberAvatarProps {
  avatarUrl?: string | null;
  name: string;
  size?: number | string;
}

export function MemberAvatar({
  avatarUrl,
  name,
  size = 28,
}: MemberAvatarProps) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "U";

  return (
    <Avatar
      src={avatarUrl ?? undefined}
      alt=""
      radius="xl"
      size={size}
      style={{ flexShrink: 0 }}
    >
      {initial}
    </Avatar>
  );
}

