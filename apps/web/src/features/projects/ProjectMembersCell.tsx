import { Avatar, Text, UnstyledButton } from "@mantine/core";
import {
  PROJECT_MEMBER_AVATAR_LIMIT,
  type ProjectMemberSummary,
} from "@repo/contracts";
import { MemberAvatar } from "../workspaces/settings/members/MemberAvatar";
import { memberDisplayName } from "../workspaces/settings/members/memberListView";
import classes from "./ProjectMembersCell.module.css";

interface ProjectMembersCellProps {
  members: readonly ProjectMemberSummary[] | null;
}

export function ProjectMembersCell({ members }: ProjectMembersCellProps) {
  if (members === null || members.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const visibleMembers = members.slice(0, PROJECT_MEMBER_AVATAR_LIMIT);
  const overflowCount = members.length - PROJECT_MEMBER_AVATAR_LIMIT;

  return (
    <Avatar.Group spacing="xs">
      {visibleMembers.map((member) => {
        const name = memberDisplayName(member);
        return (
          <UnstyledButton
            key={member.userId}
            aria-label={name}
            className={classes.memberButton}
          >
            <MemberAvatar name={name} size={26} />
          </UnstyledButton>
        );
      })}
      {overflowCount > 0 && (
        <Avatar size={26} radius="xl">
          +{overflowCount}
        </Avatar>
      )}
    </Avatar.Group>
  );
}
