import { useState } from "react";
import {
  Anchor,
  Badge,
  CloseButton,
  Combobox,
  Group,
  InputBase,
  Loader,
  Stack,
  Text,
  useCombobox,
} from "@mantine/core";
import type { MemberCandidate } from "@repo/contracts";
import { useAuth } from "../../../auth/useAuth";
import { MemberAvatar } from "./MemberAvatar";
import { memberDisplayName } from "./memberListView";
import { useMemberCandidates } from "./useMemberCandidates";

interface MemberCandidateSelectProps {
  slug: string;
  value: MemberCandidate | null;
  onChange: (candidate: MemberCandidate | null) => void;
  selectedUserIds?: readonly string[];
  error?: string | null;
  disabled?: boolean;
}

export function MemberCandidateSelect({
  slug,
  value,
  onChange,
  selectedUserIds = [],
  error,
  disabled = false,
}: MemberCandidateSelectProps) {
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const { state: authState } = useAuth();
  const isInstanceAdmin =
    authState.status === "authenticated" &&
    Boolean(authState.session.user.isInstanceAdmin);

  const candidateState = useMemberCandidates(slug, search);

  const handleClear = () => {
    onChange(null);
    setSearch("");
  };

  const handleSelect = (userId: string) => {
    if (candidateState.status === "ready") {
      const selected = candidateState.candidates.find(
        (c) => c.userId === userId,
      );
      if (selected) {
        onChange(selected);
        setSearch("");
        combobox.closeDropdown();
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (candidateState.status === "ready") {
        const trimmed = search.trim().toLowerCase();
        const exactMatch = candidateState.candidates.find(
          (c) =>
            c.email.toLowerCase() === trimmed &&
            !c.alreadyMember &&
            !selectedUserIds.includes(c.userId),
        );
        if (exactMatch) {
          event.preventDefault();
          onChange(exactMatch);
          setSearch("");
          combobox.closeDropdown();
        }
      }
    }
  };

  if (value) {
    const name = memberDisplayName(value);
    return (
      <InputBase
        component="div"
        aria-label="Email"
        error={error}
        disabled={disabled}
        rightSection={
          !disabled ? (
            <CloseButton
              aria-label="Clear selection"
              onClick={handleClear}
              size="sm"
            />
          ) : undefined
        }
        style={{ flex: 1 }}
      >
        <Group gap="xs" wrap="nowrap" align="center" style={{ height: "100%" }}>
          <MemberAvatar
            avatarUrl={value.avatarUrl}
            name={name}
            size={22}
          />
          <Group gap={6} wrap="nowrap">
            {name && <Text size="sm">{name}</Text>}
            <Text size="xs" c="dimmed">
              {value.email}
            </Text>
          </Group>
        </Group>
      </InputBase>
    );
  }

  const renderDropdownContent = () => {
    if (candidateState.status === "too_short") {
      return (
        <Combobox.Empty>Type at least 3 characters</Combobox.Empty>
      );
    }

    if (candidateState.status === "loading") {
      return (
        <Combobox.Empty>
          <Loader size="xs" />
        </Combobox.Empty>
      );
    }

    if (candidateState.status === "error") {
      if (candidateState.retryAfterSeconds) {
        return (
          <Combobox.Empty>
            {`Too many searches. Try again in ${candidateState.retryAfterSeconds} seconds.`}
          </Combobox.Empty>
        );
      }
      return <Combobox.Empty>Couldn't search. Try again.</Combobox.Empty>;
    }

    if (candidateState.status === "ready") {
      if (candidateState.candidates.length === 0) {
        return (
          <Combobox.Empty>
            <Stack gap="xs" align="flex-start">
              <Text size="sm">
                No user with this email. Ask your instance admin to create the account.
              </Text>
              {isInstanceAdmin && (
                <Anchor
                  href="/create-user"
                  target="_blank"
                  rel="noopener"
                  size="sm"
                >
                  Create user
                </Anchor>
              )}
            </Stack>
          </Combobox.Empty>
        );
      }

      return candidateState.candidates.map((c) => {
        const isAlreadyMember = c.alreadyMember;
        const isAlreadySelected = selectedUserIds.includes(c.userId);
        const isOptionDisabled = isAlreadyMember || isAlreadySelected;
        const name = memberDisplayName(c);

        return (
          <Combobox.Option
            value={c.userId}
            key={c.userId}
            disabled={isOptionDisabled}
          >
            <Group justify="space-between" wrap="nowrap" w="100%">
              <Group gap="xs" wrap="nowrap">
                <MemberAvatar
                  avatarUrl={c.avatarUrl}
                  name={name}
                  size={24}
                />
                <div>
                  {name && <Text size="sm">{name}</Text>}
                  <Text size="xs" c="dimmed">
                    {c.email}
                  </Text>
                </div>
              </Group>
              {isAlreadyMember && (
                <Badge variant="light" color="gray" size="sm">
                  Already a member
                </Badge>
              )}
              {isAlreadySelected && !isAlreadyMember && (
                <Badge variant="light" color="gray" size="sm">
                  Already selected
                </Badge>
              )}
            </Group>
          </Combobox.Option>
        );
      });
    }

    return null;
  };

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={handleSelect}
      withinPortal={false}
      transitionProps={{ duration: 0 }}
    >
      <Combobox.Target>
        <InputBase
          placeholder="name@company.com"
          aria-label="Email"
          value={search}
          error={error}
          disabled={disabled}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>{renderDropdownContent()}</Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
