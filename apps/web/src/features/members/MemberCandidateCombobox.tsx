import { type ReactNode } from 'react';
import {
  Badge,
  CloseButton,
  Combobox,
  Group,
  InputBase,
  Loader,
  Text,
  useCombobox,
} from '@mantine/core';
import { MemberAvatar } from './MemberAvatar';
import { memberDisplayName } from './memberListView';
import { tooManySearchesMessage } from './membersMessages';
import type { MemberCandidateState } from './useMemberCandidateSearch';
import classes from './MemberCandidateCombobox.module.css';

export interface CandidateBase {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface MemberCandidateComboboxProps<C extends CandidateBase> {
  value: C | null;
  onChange: (candidate: C | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
  state: MemberCandidateState<C>;
  disabledLabel?: (c: C) => string | null;
  emptyContent?: ReactNode;
  hint?: string | null;
  selectedUserIds?: readonly string[];
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
}

export function MemberCandidateCombobox<C extends CandidateBase>({
  value,
  onChange,
  search,
  onSearchChange,
  state,
  disabledLabel,
  emptyContent,
  hint,
  selectedUserIds = [],
  error,
  disabled = false,
  placeholder = 'name@company.com',
}: MemberCandidateComboboxProps<C>) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const handleClear = () => {
    onChange(null);
    onSearchChange('');
  };

  const handleSelect = (userId: string) => {
    if (state.status === 'ready') {
      const selected = state.candidates.find((c) => c.userId === userId);
      if (selected) {
        onChange(selected);
        onSearchChange('');
        combobox.closeDropdown();
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      if (state.status === 'ready') {
        const trimmed = search.trim().toLowerCase();
        const exactMatch = state.candidates.find(
          (c) =>
            c.email.toLowerCase() === trimmed &&
            !disabledLabel?.(c) &&
            !selectedUserIds.includes(c.userId),
        );
        if (exactMatch) {
          event.preventDefault();
          onChange(exactMatch);
          onSearchChange('');
          combobox.closeDropdown();
        }
      }
    }
  };

  if (value) {
    const name = memberDisplayName({
      firstName: value.firstName ?? '',
      lastName: value.lastName ?? '',
      displayName: value.displayName,
    });

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
        className={classes.input}
      >
        <Group
          gap="xs"
          wrap="nowrap"
          align="center"
          className={classes.selectedValue}
        >
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
    if (state.status === 'too_short') {
      return (
        <Combobox.Empty>
          {hint ?? state.hint ?? 'Type at least 3 characters'}
        </Combobox.Empty>
      );
    }

    if (state.status === 'loading') {
      return (
        <Combobox.Empty>
          <Loader size="xs" />
        </Combobox.Empty>
      );
    }

    if (state.status === 'error') {
      if (state.retryAfterSeconds) {
        return (
          <Combobox.Empty>
            {tooManySearchesMessage(state.retryAfterSeconds)}
          </Combobox.Empty>
        );
      }
      if (state.message) {
        return <Combobox.Empty>{state.message}</Combobox.Empty>;
      }
      return <Combobox.Empty>{"Couldn't search. Try again."}</Combobox.Empty>;
    }

    if (state.status === 'ready') {
      if (state.candidates.length === 0) {
        return (
          <Combobox.Empty>
            {emptyContent ?? <Text size="sm">No members found.</Text>}
          </Combobox.Empty>
        );
      }

      return state.candidates.map((c) => {
        const customDisabled = disabledLabel ? disabledLabel(c) : null;
        const isAlreadySelected = selectedUserIds.includes(c.userId);
        const isOptionDisabled = Boolean(customDisabled) || isAlreadySelected;
        const name = memberDisplayName({
          firstName: c.firstName ?? '',
          lastName: c.lastName ?? '',
          displayName: c.displayName,
        });

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
              {customDisabled && (
                <Badge variant="light" color="gray" size="sm">
                  {customDisabled}
                </Badge>
              )}
              {isAlreadySelected && !customDisabled && (
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
          placeholder={placeholder}
          aria-label="Email"
          value={search}
          error={error}
          disabled={disabled}
          onChange={(event) => {
            onSearchChange(event.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onKeyDown={handleKeyDown}
          className={classes.input}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>{renderDropdownContent()}</Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
