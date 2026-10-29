import type { TFunction } from "i18next";
import type { PriorityResponse } from "@repo/contracts";

export function priorityLabel(
  priority: Pick<PriorityResponse, "name" | "defaultKey">,
  t: TFunction,
): string {
  if (priority.defaultKey) {
    return t(`priority:defaults.${priority.defaultKey}`);
  }
  return priority.name;
}
