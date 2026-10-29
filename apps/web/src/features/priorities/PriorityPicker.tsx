import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_PRIORITIES, type ProjectListItem } from "@repo/contracts";
import {
  PropertyPicker,
  type PropertyPickerStatus,
} from "../workItems/properties/PropertyPicker";
import { PriorityBandIcon } from "./PriorityBandIcon";
import { priorityLabel } from "./priorityLabel";
import { useProjectPrioritiesQuery } from "./api/priorityQueries";

const DEFAULT_NONE_COLOR =
  DEFAULT_PRIORITIES.find((p) => p.key === "none")?.color ?? "#6B7280";

export interface PriorityPickerProps {
  slug: string;
  project: ProjectListItem;
  value: string | null;
  onChange: (priorityId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function PriorityPicker({
  slug,
  project,
  value,
  onChange,
  disabled = false,
  className,
}: PriorityPickerProps) {
  const { t } = useTranslation();

  const canViewPriorities = project.permissions.includes(
    "project.workitems.view",
  );

  const { data, isLoading, isError } = useProjectPrioritiesQuery(
    slug,
    project.identifier,
    canViewPriorities,
  );

  const priorities = useMemo(() => data?.priorities ?? [], [data?.priorities]);

  const selectedPriority = useMemo(() => {
    if (!data) return undefined;
    return (
      (value ? priorities.find((p) => p.id === value) : undefined) ??
      priorities.find((p) => p.id === data.initialPriorityId) ??
      priorities[0]
    );
  }, [data, priorities, value]);

  const status: PropertyPickerStatus = useMemo(() => {
    if (!canViewPriorities) return "no_permission";
    if (isLoading) return "loading";
    if (isError || !data) return "error";
    return "ready";
  }, [canViewPriorities, isLoading, isError, data]);

  const lockedTooltip = useMemo(() => {
    if (!canViewPriorities) return t("priority:picker.noPermission");
    if (isError || !data) return t("priority:picker.loadFailed");
    return undefined;
  }, [canViewPriorities, isError, data, t]);

  const options = useMemo(() => {
    return priorities.map((p) => ({
      id: p.id,
      label: priorityLabel(p, t),
      icon: <PriorityBandIcon band={p.band} color={p.color} size={14} />,
    }));
  }, [priorities, t]);

  const triggerLabel = selectedPriority
    ? priorityLabel(selectedPriority, t)
    : t("priority:defaults.none");

  const triggerIcon = (
    <PriorityBandIcon
      band={selectedPriority ? selectedPriority.band : "none"}
      color={selectedPriority ? selectedPriority.color : DEFAULT_NONE_COLOR}
      size={14}
    />
  );

  const handleChange = (id: string) => {
    if (id === data?.initialPriorityId) {
      onChange(null);
    } else {
      onChange(id);
    }
  };

  return (
    <PropertyPicker
      ariaLabel={t("priority:picker.chipLabel", { name: triggerLabel })}
      triggerLabel={triggerLabel}
      triggerIcon={triggerIcon}
      status={status}
      lockedTooltip={lockedTooltip}
      options={options}
      value={selectedPriority?.id ?? null}
      onChange={handleChange}
      searchPlaceholder={t("priority:picker.search")}
      emptyLabel={t("priority:picker.empty")}
      disabled={disabled}
      testIdPrefix="priority"
      className={className}
    />
  );
}
