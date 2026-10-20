import {
  EMAIL_MAX,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
  type AdminUserResponse,
  type UpdateAdminUserRequest,
} from "@repo/contracts";
import { translate } from "../../../i18n/index.js";
import {
  validateConfirmPassword,
  validatePassword,
} from "../../passwords/passwordValidation.js";

export { validateConfirmPassword, validatePassword };

export type CreateUserField =
  | "firstName"
  | "lastName"
  | "displayName"
  | "email"
  | "password"
  | "confirmPassword";

export interface CreateUserValues {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface EditUserValues {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
}

export type EditUserField = keyof EditUserValues;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFirstName(value: string): string | null {
  const normalized = normalizeName(value);
  if (normalized === "") {
    return translate("users:errors.firstNameRequired");
  }
  if (normalized.length > USER_NAME_MAX) {
    return translate("users:errors.firstNameTooLong", {
      max: USER_NAME_MAX,
    });
  }
  if (!USER_NAME_ALLOWED.test(normalized)) {
    return translate("users:errors.hiddenChars");
  }
  return null;
}

export function validateLastName(value: string): string | null {
  const normalized = normalizeName(value);
  if (normalized === "") return null;
  if (normalized.length > USER_NAME_MAX) {
    return translate("users:errors.lastNameTooLong", {
      max: USER_NAME_MAX,
    });
  }
  if (!USER_NAME_ALLOWED.test(normalized)) {
    return translate("users:errors.hiddenChars");
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  const normalized = normalizeName(value);
  if (normalized === "") {
    return translate("users:errors.displayNameRequired");
  }
  if (normalized.length > USER_NAME_MAX) {
    return translate("users:errors.displayNameTooLong", {
      max: USER_NAME_MAX,
    });
  }
  if (!USER_NAME_ALLOWED.test(normalized)) {
    return translate("users:errors.hiddenChars");
  }
  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    !EMAIL_REGEX.test(trimmed) ||
    trimmed.length > EMAIL_MAX
  ) {
    return translate("users:errors.emailValid");
  }
  return null;
}


export function validateCreateUserField(
  field: CreateUserField,
  values: CreateUserValues,
): string | null {
  switch (field) {
    case "firstName":
      return validateFirstName(values.firstName);
    case "lastName":
      return validateLastName(values.lastName);
    case "displayName":
      return validateDisplayName(values.displayName);
    case "email":
      return validateEmail(values.email);
    case "password":
      return validatePassword(values.password, values.email);
    case "confirmPassword":
      return validateConfirmPassword(values.confirmPassword, values.password);
  }
}

const EDIT_USER_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "email",
] as const satisfies readonly EditUserField[];

/** How each edit field is compared and sent: names NFC + trim, email trim + lower-case. */
function normalizeEditUserValues(values: EditUserValues): EditUserValues {
  return {
    firstName: normalizeName(values.firstName),
    lastName: normalizeName(values.lastName),
    displayName: normalizeName(values.displayName),
    email: values.email.trim().toLowerCase(),
  };
}

/**
 * WEB B2.5 steps 4–5, the one place "changed" is decided: the fields whose
 * normalized value differs from the loaded user, with that normalized value.
 * Validation, the Save button and the PATCH body all read this.
 */
export function changedEditFields(
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): Partial<EditUserValues> {
  const next = normalizeEditUserValues(values);
  const loaded = normalizeEditUserValues({
    firstName: loadedUser.firstName,
    lastName: loadedUser.lastName ?? "",
    displayName: loadedUser.displayName,
    email: loadedUser.email,
  });
  const changed: Partial<EditUserValues> = {};
  for (const field of EDIT_USER_FIELDS) {
    if (next[field] !== loaded[field]) changed[field] = next[field];
  }
  return changed;
}

const EDIT_FIELD_VALIDATORS: Record<
  EditUserField,
  (value: string) => string | null
> = {
  firstName: validateFirstName,
  lastName: validateLastName,
  displayName: validateDisplayName,
  email: validateEmail,
};

/** Only changed fields are checked (RQ D35): an unchanged bad value never blocks Save. */
export function validateEditUserField(
  field: EditUserField,
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): string | null {
  if (changedEditFields(values, loadedUser)[field] === undefined) return null;
  return EDIT_FIELD_VALIDATORS[field](values[field]);
}

export function hasEditUserChanges(
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): boolean {
  return Object.keys(changedEditFields(values, loadedUser)).length > 0;
}

export function buildUpdateAdminUserPayload(
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): UpdateAdminUserRequest {
  return {
    expectedUpdatedAt: loadedUser.updatedAt,
    ...changedEditFields(values, loadedUser),
  };
}

export function adminUserLabel(user: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}): string {
  return (
    user.displayName?.trim() ||
    `${user.firstName ?? ""}`.trim() +
      (user.lastName?.trim() ? ` ${user.lastName.trim()}` : "") ||
    user.email
  );
}

export interface ChangePasswordValues {
  password: string;
  confirmPassword: string;
  /** The acting admin's own password; sent only when the field is shown (API B7). */
  actorPassword: string;
}

export type ChangePasswordField = keyof ChangePasswordValues;

export function hasChangePasswordChanges(
  values: ChangePasswordValues,
): boolean {
  return Object.values(values).some((value) => value !== "");
}

export function validateChangePasswordField(
  field: ChangePasswordField,
  values: ChangePasswordValues,
  targetEmail: string,
  needsActorPassword: boolean,
): string | null {
  switch (field) {
    case "password":
      return validatePassword(values.password, targetEmail);
    case "confirmPassword":
      return validateConfirmPassword(values.confirmPassword, values.password);
    case "actorPassword":
      return needsActorPassword && values.actorPassword === ""
        ? translate("admin:users.validation.actorPasswordRequired")
        : null;
  }
}


