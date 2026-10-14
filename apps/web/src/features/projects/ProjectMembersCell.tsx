import { useContext } from "react";
import { Avatar, Text, UnstyledButton } from "@mantine/core";
import { t } from "i18next";
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
  /** First members (oldest first); the API caps this list. */
  members: readonly ProjectMemberSummary[] | null;
  /** Real number of members; may exceed `members.length`. */
  memberCount: number | null;
  currentUserId?: string;
}

export function ProjectMembersCell({
  members,
  memberCount,
  currentUserId,
}: ProjectMembersCellProps) {
  const auth = useContext(AuthContext);
  const activeUserId =
    currentUserId ??
    (auth?.state.status === "authenticated"
      ? auth.state.session.user.id
      : undefined);

  if (members === null) {
    const hiddenLabel = t("members:cell.hiddenForRole");
    return (
      <PersonHint content={hiddenLabel}>
        {({ onClick, onKeyDown }) => (
          <UnstyledButton
            aria-label={hiddenLabel}
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

  const youSuffix = t("members:cell.you");
  const deactivatedLabel = t("members:cell.deactivated");
  const visibleMembers = members.slice(0, PROJECT_MEMBER_AVATAR_LIMIT);
  const overflowMembers = members.slice(PROJECT_MEMBER_AVATAR_LIMIT);
  const total = Math.max(memberCount ?? members.length, members.length);
  const overflowCount = total - visibleMembers.length;
  // Members past the API preview are counted but not named.
  const unnamedCount = total - members.length;
  const unnamedLabel = t("members:cell.andMore", { count: unnamedCount });

  return (
    <Avatar.Group spacing="xs">
      {visibleMembers.map((member) => {
        const name = memberDisplayName(member);
        const isYou = Boolean(activeUserId && member.userId === activeUserId);
        const nameWithYou = isYou ? `${name} ${youSuffix}` : name;
        const ariaLabel = [
          nameWithYou,
          member.email,
          !member.accountActive ? deactivatedLabel.toLowerCase() : undefined,
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
              <div className={classes.hintDeactivated}>{deactivatedLabel}</div>
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
                const isYou = Boolean(
                  activeUserId && m.userId === activeUserId,
                );
                return (
                  <div key={m.userId} className={classes.overflowName}>
                    {name}
                    {isYou ? ` ${youSuffix}` : ""}
                  </div>
                );
              })}
              {unnamedCount > 0 && (
                <div className={classes.overflowName}>{unnamedLabel}</div>
              )}
            </div>
          }
        >
          {({ onClick, onKeyDown }) => {
            const overflowNames = overflowMembers.map((m) => {
              const name = memberDisplayName(m);
              const isYou = Boolean(activeUserId && m.userId === activeUserId);
              return `${name}${isYou ? ` ${youSuffix}` : ""}`;
            });
            if (unnamedCount > 0) overflowNames.push(unnamedLabel);
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
