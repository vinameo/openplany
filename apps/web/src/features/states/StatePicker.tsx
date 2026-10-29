import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_STATE_COLOR,
  STATE_GROUPS,
  type ProjectListItem,
} from "@repo/contracts";
import {
  PropertyPicker,
  type PropertyPickerStatus,
} from "../workItems/properties/PropertyPicker";
import { StateGroupIcon } from "./StateGroupIcon";
import { useProjectStatesQuery } from "./api/stateQueries";

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

  const canViewStates = project.permissions.includes("project.states.view");

  const { data, isLoading, isError } = useProjectStatesQuery(
    slug,
    project.identifier,
    canViewStates,
  );

  const states = useMemo(() => data?.states ?? [], [data?.states]);

  const selectedState = useMemo(() => {
    if (!data) return undefined;
    return (
      (value ? states.find((s) => s.id === value) : undefined) ??
      states.find((s) => s.id === data.initialStateId) ??
      states[0]
    );
  }, [data, states, value]);

  const status: PropertyPickerStatus = useMemo(() => {
    if (!canViewStates) return "no_permission";
    if (isLoading) return "loading";
    if (isError || !data) return "error";
    return "ready";
  }, [canViewStates, isLoading, isError, data]);

  const lockedTooltip = useMemo(() => {
    if (!canViewStates) return t("state:picker.noPermission");
    if (isError || !data) return t("state:picker.loadFailed");
    return undefined;
  }, [canViewStates, isError, data, t]);

  const hasCustomStates = useMemo(() => {
    return states.some((s) => s.level !== "default");
  }, [states]);

  const options = useMemo(() => {
    return states.map((s) => ({
      id: s.id,
      label: s.name,
      icon: <StateGroupIcon group={s.group} color={s.color} size={14} />,
      group: s.group,
    }));
  }, [states]);

  const groupLabels = useMemo(() => {
    if (!hasCustomStates) return undefined;
    return Object.fromEntries(
      STATE_GROUPS.map((groupKey) => [groupKey, t(`state:groups.${groupKey}`)]),
    );
  }, [hasCustomStates, t]);

  const triggerLabel = selectedState?.name ?? t("state:picker.initialFallback");

  const triggerIcon = (
    <StateGroupIcon
      group={selectedState ? selectedState.group : "backlog"}
      color={selectedState ? selectedState.color : DEFAULT_STATE_COLOR}
      size={14}
    />
  );

  return (
    <PropertyPicker
      ariaLabel={t("workItem:properties.state")}
      triggerLabel={triggerLabel}
      triggerIcon={triggerIcon}
      status={status}
      lockedTooltip={lockedTooltip}
      options={options}
      groupLabels={groupLabels}
      value={selectedState?.id ?? null}
      onChange={onChange}
      searchPlaceholder={t("state:picker.search")}
      emptyLabel={t("state:picker.empty")}
      disabled={disabled}
      testIdPrefix="state"
      className={className}
    />
  );
}
