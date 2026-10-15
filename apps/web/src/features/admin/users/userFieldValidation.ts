import {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
} from "@repo/contracts";
import { translate } from "../../../i18n/index.js";

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

export function validatePassword(value: string, email?: string): string | null {
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return translate("users:errors.passwordLength", {
      min: PASSWORD_MIN,
      max: PASSWORD_MAX,
    });
  }
  if (
    email &&
    email.trim() !== "" &&
    value.toLowerCase() === email.trim().toLowerCase()
  ) {
    return translate("users:errors.passwordSameAsEmail");
  }
  return null;
}

export function validateConfirmPassword(
  confirmPassword: string,
  password: string,
): string | null {
  if (confirmPassword === "" || confirmPassword !== password) {
    return translate("admin:users.validation.passwordsDoNotMatch");
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
