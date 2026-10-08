import { useMemo, type ReactNode } from "react";
import { Select, type OptionsFilter } from "@mantine/core";
import { WORKSPACE_TIMEZONE_SET, WORKSPACE_TIMEZONES } from "@repo/contracts";
import {
  buildTimezoneOptions,
  getCachedBaseTimezoneOptions,
} from "./timezoneOptions";

export interface TimezoneSelectProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  error?: ReactNode;
}

export function TimezoneSelect({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  error,
}: TimezoneSelectProps) {
  const options = useMemo(() => {
    if (value && !WORKSPACE_TIMEZONE_SET.has(value)) {
      return buildTimezoneOptions(WORKSPACE_TIMEZONES, new Date(), value);
    }
    return getCachedBaseTimezoneOptions(WORKSPACE_TIMEZONES);
  }, [value]);

  const searchMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of options) {
      map.set(opt.value, opt.search);
    }
    return map;
  }, [options]);

  const selectData = useMemo(
    () => options.map((opt) => ({ value: opt.value, label: opt.label })),
    [options],
  );

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
      label="Workspace Timezone"
      description="Set the timezone used for dates, times, and notifications in this workspace."
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
