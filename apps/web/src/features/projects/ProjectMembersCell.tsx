import { useContext } from "react";
import { Avatar, Text, UnstyledButton } from "@mantine/core";
import {
  PROJECT_MEMBER_AVATAR_LIMIT,
  type ProjectMemberSummary,
} from "@repo/contracts";
import { AuthContext } from "../auth/authContext";
import { MemberAvatar } from "../workspaces/settings/members/MemberAvatar";
import { memberDisplayName } from "../workspaces/settings/members/memberListView";
import { PersonHint } from "./PersonHint";
import classes from "./ProjectMembersCell.module.css";

export interface ProjectMembersCellProps {
  members: readonly ProjectMemberSummary[] | null;
  currentUserId?: string;
}

export function ProjectMembersCell({
  members,
  currentUserId,
}: ProjectMembersCellProps) {
  const auth = useContext(AuthContext);
  const activeUserId =
    currentUserId ??
    (auth?.state.status === "authenticated"
      ? auth.state.session.user.id
      : undefined);

  if (members === null) {
    return (
      <PersonHint content="Hidden for your role">
        {({ onClick, onKeyDown }) => (
          <UnstyledButton
            aria-label="Hidden for your role"
            onClick={onClick}
            onKeyDown={onKeyDown}
            className={classes.hiddenButton}
          >
            <Text size="sm" c="dimmed">
              —
            </Text>
          </UnstyledButton>
        )}
      </PersonHint>
    );
  }

  if (members.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  }

  const visibleMembers = members.slice(0, PROJECT_MEMBER_AVATAR_LIMIT);
  const overflowMembers = members.slice(PROJECT_MEMBER_AVATAR_LIMIT);
  const overflowCount = overflowMembers.length;

  return (
    <Avatar.Group spacing="xs">
      {visibleMembers.map((member) => {
        const name = memberDisplayName(member);
        const isYou = Boolean(activeUserId && member.userId === activeUserId);
        const nameWithYou = isYou ? `${name} (you)` : name;
        const ariaLabel = [
          nameWithYou,
          member.email,
          !member.accountActive ? "deactivated" : undefined,
        ]
          .filter(Boolean)
          .join(", ");

        const hintContent = (
          <div className={classes.hintContainer}>
            <div className={classes.hintName}>{nameWithYou}</div>
            {member.email && (
              <div className={classes.hintEmail}>{member.email}</div>
            )}
            {!member.accountActive && (
              <div className={classes.hintDeactivated}>Deactivated</div>
            )}
          </div>
        );

        return (
          <PersonHint key={member.userId} content={hintContent}>
            {({ onClick, onKeyDown }) => (
              <UnstyledButton
                aria-label={ariaLabel}
                onClick={onClick}
                onKeyDown={onKeyDown}
                className={`${classes.memberButton} ${!member.accountActive ? classes.deactivated : ""}`}
              >
                <MemberAvatar name={name} size={26} />
              </UnstyledButton>
            )}
          </PersonHint>
        );
      })}

      {overflowCount > 0 && (
        <PersonHint
          content={
            <div className={classes.overflowList}>
              {overflowMembers.map((m) => {
                const name = memberDisplayName(m);
                const isYou = Boolean(activeUserId && m.userId === activeUserId);
                return (
                  <div key={m.userId} className={classes.overflowName}>
                    {name}
                    {isYou ? " (you)" : ""}
                  </div>
                );
              })}
            </div>
          }
        >
          {({ onClick, onKeyDown }) => {
            const overflowNames = overflowMembers.map((m) => {
              const name = memberDisplayName(m);
              const isYou = Boolean(activeUserId && m.userId === activeUserId);
              return `${name}${isYou ? " (you)" : ""}`;
            });
            const overflowAriaLabel = `+${overflowCount}: ${overflowNames.join(", ")}`;

            return (
              <UnstyledButton
                aria-label={overflowAriaLabel}
                onClick={onClick}
                onKeyDown={onKeyDown}
                className={classes.memberButton}
              >
                <Avatar size={26} radius="xl">
                  +{overflowCount}
                </Avatar>
              </UnstyledButton>
            );
          }}
        </PersonHint>
      )}
    </Avatar.Group>
  );
}
