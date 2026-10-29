import { useMemo, useState, type ReactNode } from "react";
import { Button, Combobox, Text, Tooltip, useCombobox } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import classes from "./PropertyPicker.module.css";

// The trigger chip is narrower than a property name, so the dropdown keeps its own width.
export const DROPDOWN_WIDTH = 240;

export interface PropertyOption {
  id: string;
  label: string;
  icon?: ReactNode;
  group?: string;
}

export type PropertyPickerStatus =
  "ready" | "loading" | "error" | "no_permission";

export interface PropertyPickerProps {
  ariaLabel: string;
  triggerLabel: string;
  triggerIcon?: ReactNode;
  status: PropertyPickerStatus;
  lockedTooltip?: string;
  options: PropertyOption[];
  groupLabels?: Record<string, string>;
  value: string | null;
  onChange: (id: string) => void;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  testIdPrefix: string;
  className?: string;
}

export function PropertyPicker({
  ariaLabel,
  triggerLabel,
  triggerIcon,
  status,
  lockedTooltip,
  options,
  groupLabels,
  value,
  onChange,
  searchPlaceholder,
  emptyLabel,
  disabled = false,
  testIdPrefix,
  className,
}: PropertyPickerProps) {
  const [search, setSearch] = useState("");

  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setSearch("");
    },
  });

  const filteredOptions = useMemo(() => {
    const q = search.trim().normalize("NFC").toLocaleLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      opt.label.normalize("NFC").toLocaleLowerCase().includes(q),
    );
  }, [options, search]);

  const buttonClass = className
    ? `${classes.chipButton} ${className}`
    : classes.chipButton;

  if (status !== "ready") {
    const testId =
      status === "no_permission"
        ? `${testIdPrefix}-picker-no-permission`
        : status === "loading"
          ? `${testIdPrefix}-picker-loading`
          : `${testIdPrefix}-picker-load-failed`;

    const button = (
      <Button
        type="button"
        variant="default"
        size="xs"
        radius="sm"
        leftSection={triggerIcon}
        className={buttonClass}
        aria-label={ariaLabel}
        aria-disabled="true"
        tabIndex={0}
        data-testid={testId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {triggerLabel}
      </Button>
    );

    if (lockedTooltip) {
      return (
        <Tooltip
          label={lockedTooltip}
          withArrow
          position="top"
          events={{ hover: true, focus: true, touch: false }}
        >
          {button}
        </Tooltip>
      );
    }

    return button;
  }

  const handleSelect = (id: string) => {
    onChange(id);
    combobox.closeDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      combobox.closeDropdown();
    }
  };

  const renderOption = (opt: PropertyOption) => {
    const isSelected = value !== null && opt.id === value;
    return (
      <Combobox.Option
        value={opt.id}
        key={opt.id}
        active={isSelected}
        data-testid={`${testIdPrefix}-option-${opt.id}`}
      >
        <div className={classes.optionRow}>
          <div className={classes.optionLabel}>
            {opt.icon}
            <Text size="sm" truncate="end" title={opt.label}>
              {opt.label}
            </Text>
          </div>
          {isSelected && (
            <IconCheck
              size={14}
              className={classes.checkIcon}
              aria-hidden="true"
            />
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
      width={DROPDOWN_WIDTH}
      position="bottom-start"
    >
      <Combobox.Target>
        <Button
          type="button"
          variant="default"
          size="xs"
          radius="sm"
          leftSection={triggerIcon}
          onClick={() => combobox.toggleDropdown()}
          onKeyDown={handleKeyDown}
          className={buttonClass}
          disabled={disabled}
          aria-label={ariaLabel}
          data-testid={`${testIdPrefix}-picker-button`}
        >
          {triggerLabel}
        </Button>
      </Combobox.Target>

      <Combobox.Dropdown
        onKeyDown={handleKeyDown}
        className={classes.dropdown}
        data-testid={`${testIdPrefix}-picker-dropdown`}
      >
        <Combobox.Search
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder={searchPlaceholder}
          onKeyDown={handleKeyDown}
          data-testid={`${testIdPrefix}-picker-search`}
        />
        <Combobox.Options className={classes.options}>
          {filteredOptions.length === 0 ? (
            <Combobox.Empty>{emptyLabel}</Combobox.Empty>
          ) : !groupLabels ? (
            filteredOptions.map(renderOption)
          ) : (
            Object.keys(groupLabels).map((groupKey) => {
              const groupItems = filteredOptions.filter(
                (opt) => opt.group === groupKey,
              );
              if (groupItems.length === 0) return null;
              return (
                <Combobox.Group label={groupLabels[groupKey]} key={groupKey}>
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
