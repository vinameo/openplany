import {
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
} from "@repo/contracts";

export const PROFILE_FIELDS = ["firstName", "lastName", "displayName"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string>;

export { normalizeName };

const LABELS: Record<ProfileField, string> = {
  firstName: "First name",
  lastName: "Last name",
  displayName: "Display name",
};
const REQUIRED_MESSAGES: Partial<Record<ProfileField, string>> = {
  firstName: "Enter your first name",
  displayName: "Enter a display name",
};

/** The error for one field, or null when the value is acceptable. */
export function validateName(
  field: ProfileField,
  value: string,
): string | null {
  const name = normalizeName(value);
  const required = REQUIRED_MESSAGES[field];
  if (required !== undefined && name === "") return required;
  if (name.length > USER_NAME_MAX) {
    return `${LABELS[field]} must be ${USER_NAME_MAX} characters or fewer`;
  }
  if (!USER_NAME_ALLOWED.test(name)) return "Contains characters that aren't allowed";
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
