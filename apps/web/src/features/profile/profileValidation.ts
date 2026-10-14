import {
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
  type MessageKey,
} from "@repo/contracts";
import { translate } from "../../i18n/index.js";

export const PROFILE_FIELDS = ["firstName", "lastName", "displayName"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string>;

export { normalizeName };

const LABELS: Record<ProfileField, MessageKey> = {
  firstName: "profile:form.firstName",
  lastName: "profile:form.lastName",
  displayName: "profile:form.displayName",
};
const REQUIRED_MESSAGES: Partial<Record<ProfileField, MessageKey>> = {
  firstName: "profile:validation.enterFirstName",
  displayName: "profile:validation.enterDisplayName",
};

/** The error for one field, or null when the value is acceptable. */
export function validateName(
  field: ProfileField,
  value: string,
): string | null {
  const name = normalizeName(value);
  const required = REQUIRED_MESSAGES[field];
  if (required !== undefined && name === "") return translate(required);
  if (name.length > USER_NAME_MAX) {
    return translate("profile:validation.nameMax", {
      label: translate(LABELS[field]),
      max: USER_NAME_MAX,
    });
  }
  if (!USER_NAME_ALLOWED.test(name)) {
    return translate("profile:validation.disallowedCharacters");
  }
  return null;
}

/** Fields whose normalized value differs from the starting values. */
export function diffProfile(
  initial: ProfileValues,
  current: ProfileValues,
): Partial<ProfileValues> {
  const changes: Partial<ProfileValues> = {};
  for (const field of PROFILE_FIELDS) {
    const value = normalizeName(current[field]);
    if (value !== normalizeName(initial[field])) changes[field] = value;
  }
  return changes;
}

/** "First Last", or null when both are empty. */
export function fullName(
  values: Pick<ProfileValues, "firstName" | "lastName">,
): string | null {
  const name = [values.firstName, values.lastName]
    .map(normalizeName)
    .filter((part) => part !== "")
    .join(" ");
  return name === "" ? null : name;
}
