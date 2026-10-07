// Mirrors apps/api/src/users/dto/updateProfile.dto.ts so errors show before a
// round trip; the server stays the source of truth.

export const PROFILE_FIELDS = ["firstName", "lastName", "displayName"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileValues = Record<ProfileField, string>;

const MAX_NAME_LENGTH = 50;
// Control (Cc) and invisible format (Cf) characters, zero-width spaces included.
const HIDDEN_CHARS = /[\p{Cc}\p{Cf}]/u;

const LABELS: Record<ProfileField, string> = {
  firstName: "First name",
  lastName: "Last name",
  displayName: "Display name",
};
const REQUIRED_MESSAGES: Partial<Record<ProfileField, string>> = {
  firstName: "Enter your first name",
  displayName: "Enter a display name",
};

/** Same cleanup as the server: composed Unicode (NFC) and no surrounding spaces. */
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim();
}

/** The error for one field, or null when the value is acceptable. */
export function validateName(
  field: ProfileField,
  value: string,
): string | null {
  const name = normalizeName(value);
  const required = REQUIRED_MESSAGES[field];
  if (required !== undefined && name === "") return required;
  if (name.length > MAX_NAME_LENGTH) {
    return `${LABELS[field]} must be ${MAX_NAME_LENGTH} characters or fewer`;
  }
  if (HIDDEN_CHARS.test(name)) return "Contains characters that aren't allowed";
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
