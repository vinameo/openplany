import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Combobox,
  Text,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import {
  DEFAULT_STATE_COLOR,
  STATE_GROUPS,
  type ProjectListItem,
  type StateGroup,
} from "@repo/contracts";
import { IconCheck } from "@tabler/icons-react";
import { StateGroupIcon } from "./StateGroupIcon";
import { useProjectStatesQuery } from "./api/stateQueries";
import classes from "./StatePicker.module.css";

export interface StatePickerProps {
  slug: string;
  project: ProjectListItem;
  value: string | null;
  onChange: (stateId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function StatePicker({
  slug,
  project,
  value,
  onChange,
  disabled = false,
  className,
}: StatePickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const canViewStates = project.permissions.includes("project.states.view");

  const { data, isLoading, isError } = useProjectStatesQuery(
    slug,
    project.identifier,
    canViewStates,
  );

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });

  const states = useMemo(() => data?.states ?? [], [data?.states]);

  const selectedState = useMemo(() => {
    if (!data) return undefined;
    return (
      (value ? states.find((s) => s.id === value) : undefined) ??
      states.find((s) => s.id === data.initialStateId) ??
      states[0]
    );
  }, [data, states, value]);

  const filteredStates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return states;
    return states.filter((s) => s.name.toLowerCase().includes(q));
  }, [states, search]);

  const hasCustomStates = useMemo(() => {
    return states.some((s) => s.level !== "default");
  }, [states]);

  const buttonClass = className
    ? `${classes.chipButton} ${className}`
    : classes.chipButton;

  // Case 1: Actor lacks project.states.view permission
  if (!canViewStates) {
    return (
      <Tooltip label={t("state:picker.noPermission")} withArrow position="top">
        <span>
          <Button
            type="button"
            variant="default"
            size="xs"
            radius="sm"
            disabled
            leftSection={
              <StateGroupIcon
                group="backlog"
                color={DEFAULT_STATE_COLOR}
                size={14}
              />
            }
            className={buttonClass}
            aria-label={t("workItem:properties.state")}
            data-testid="state-picker-no-permission"
          >
            {t("state:picker.initialFallback")}
          </Button>
        </span>
      </Tooltip>
    );
  }

  // Case 2: Loading states
  if (isLoading) {
    return (
      <Button
        type="button"
        variant="default"
        size="xs"
        radius="sm"
        disabled
        leftSection={
          <StateGroupIcon
            group="backlog"
            color={DEFAULT_STATE_COLOR}
            size={14}
          />
        }
        className={buttonClass}
        aria-label={t("workItem:properties.state")}
        data-testid="state-picker-loading"
      >
        {t("state:picker.initialFallback")}
      </Button>
    );
  }

  // Case 3: Error loading states
  if (isError || !data) {
    return (
      <Tooltip label={t("state:picker.loadFailed")} withArrow position="top">
        <span>
          <Button
            type="button"
            variant="default"
            size="xs"
            radius="sm"
            disabled
            leftSection={
              <StateGroupIcon
                group="backlog"
                color={DEFAULT_STATE_COLOR}
                size={14}
              />
            }
            className={buttonClass}
            aria-label={t("workItem:properties.state")}
            data-testid="state-picker-load-failed"
          >
            {t("state:picker.initialFallback")}
          </Button>
        </span>
      </Tooltip>
    );
  }

  const handleSelect = (stateId: string) => {
    onChange(stateId);
    combobox.closeDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      combobox.closeDropdown();
    }
  };

  const renderOption = (s: (typeof states)[number]) => {
    const isSelected = selectedState && s.id === selectedState.id;
    return (
      <Combobox.Option
        value={s.id}
        key={s.id}
        active={isSelected}
        data-testid={"state-option-" + s.id}
      >
        <div className={classes.optionRow}>
          <div className={classes.optionLabel}>
            <StateGroupIcon group={s.group} color={s.color} size={14} />
            <Text size="sm">{s.name}</Text>
          </div>
          {isSelected && (
            <IconCheck size={14} className={classes.checkIcon} aria-hidden="true" />
          )}
        </div>
      </Combobox.Option>
    );
  };

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={handleSelect}
      withinPortal={true}
    >
      <Combobox.Target>
        <Button
          type="button"
          variant="default"
          size="xs"
          radius="sm"
          leftSection={
            selectedState ? (
              <StateGroupIcon
                group={selectedState.group}
                color={selectedState.color}
                size={14}
              />
            ) : undefined
          }
          onClick={() => combobox.toggleDropdown()}
          className={buttonClass}
          disabled={disabled}
          aria-label={t("workItem:properties.state")}
          data-testid="state-picker-button"
        >
          {selectedState?.name ?? t("state:picker.initialFallback")}
        </Button>
      </Combobox.Target>

      <Combobox.Dropdown
        onKeyDown={handleKeyDown}
        data-testid="state-picker-dropdown"
      >
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder={t("state:picker.search")}
          onKeyDown={handleKeyDown}
          data-testid="state-picker-search"
        />
        <Combobox.Options>
          {filteredStates.length === 0 ? (
            <Combobox.Empty>{t("state:picker.empty")}</Combobox.Empty>
          ) : !hasCustomStates ? (
            filteredStates.map(renderOption)
          ) : (
            STATE_GROUPS.map((groupKey: StateGroup) => {
              const groupItems = filteredStates.filter(
                (s) => s.group === groupKey,
              );
              if (groupItems.length === 0) return null;
              return (
                <Combobox.Group
                  label={t(`state:groups.${groupKey}`)}
                  key={groupKey}
                >
                  {groupItems.map(renderOption)}
                </Combobox.Group>
              );
            })
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
