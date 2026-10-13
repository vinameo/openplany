import { useMemo, type ReactNode } from "react";
import { Select, type OptionsFilter } from "@mantine/core";
import { WORKSPACE_TIMEZONE_SET, WORKSPACE_TIMEZONES } from "@repo/contracts";
import {
  buildTimezoneOptions,
  getCachedBaseTimezoneOptions,
} from "./timezoneOptions";

export interface TimezoneSelectProps {
  label?: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  error?: ReactNode;
  followOption?: { value: string; label: string };
}

export function TimezoneSelect({
  label = "Workspace Timezone",
  description = "Set the timezone used for dates, times, and notifications in this workspace.",
  value,
  onChange,
  readOnly = false,
  disabled = false,
  error,
  followOption,
}: TimezoneSelectProps) {
  const isFollow = followOption && value === followOption.value;
  const isUnknownZone = value && !WORKSPACE_TIMEZONE_SET.has(value) && !isFollow;

  const options = useMemo(() => {
    if (isUnknownZone) {
      return buildTimezoneOptions(WORKSPACE_TIMEZONES, new Date(), value);
    }
    return getCachedBaseTimezoneOptions(WORKSPACE_TIMEZONES);
  }, [isUnknownZone, value]);

  const searchMap = useMemo(() => {
    const map = new Map<string, string>();
    if (followOption) {
      map.set(
        followOption.value,
        `${followOption.value} ${followOption.label} workspace`.toLowerCase(),
      );
    }
    for (const opt of options) {
      map.set(opt.value, opt.search);
    }
    return map;
  }, [options, followOption]);

  const selectData = useMemo(() => {
    const base = options.map((opt) => ({ value: opt.value, label: opt.label }));
    if (followOption) {
      return [
        { value: followOption.value, label: followOption.label },
        ...base.filter((opt) => opt.value !== followOption.value),
      ];
    }
    return base;
  }, [options, followOption]);

  const optionsFilter: OptionsFilter = ({ options: items, search }) => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      if ("value" in item) {
        const itemSearch = searchMap.get(item.value) ?? "";
        return itemSearch.includes(query);
      }
      return false;
    });
  };

  return (
    <Select
      label={label}
      description={description}
      data={selectData}
      value={value}
      onChange={(val) => {
        if (val && !readOnly) {
          onChange(val);
        }
      }}
      filter={optionsFilter}
      searchable={!readOnly}
      readOnly={readOnly}
      disabled={disabled}
      error={error}
      allowDeselect={false}
      maxDropdownHeight={280}
      nothingFoundMessage="No timezone found"
      checkIconPosition="right"
      comboboxProps={{ withinPortal: true }}
    />
  );
}
