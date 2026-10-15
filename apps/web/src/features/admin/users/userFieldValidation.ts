import {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
  type AdminUserResponse,
  type UpdateAdminUserRequest,
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

export function validateEditUserField(
  field: EditUserField,
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): string | null {
  switch (field) {
    case "firstName": {
      if (
        normalizeName(values.firstName) === normalizeName(loadedUser.firstName)
      ) {
        return null;
      }
      return validateFirstName(values.firstName);
    }
    case "lastName": {
      if (
        normalizeName(values.lastName) ===
        normalizeName(loadedUser.lastName ?? "")
      ) {
        return null;
      }
      return validateLastName(values.lastName);
    }
    case "displayName": {
      if (
        normalizeName(values.displayName) ===
        normalizeName(loadedUser.displayName)
      ) {
        return null;
      }
      return validateDisplayName(values.displayName);
    }
    case "email": {
      if (
        values.email.trim().toLowerCase() ===
        loadedUser.email.trim().toLowerCase()
      ) {
        return null;
      }
      return validateEmail(values.email);
    }
  }
}

export function hasEditUserChanges(
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): boolean {
  return (
    normalizeName(values.firstName) !== normalizeName(loadedUser.firstName) ||
    normalizeName(values.lastName) !==
      normalizeName(loadedUser.lastName ?? "") ||
    normalizeName(values.displayName) !==
      normalizeName(loadedUser.displayName) ||
    values.email.trim().toLowerCase() !== loadedUser.email.trim().toLowerCase()
  );
}

export function buildUpdateAdminUserPayload(
  values: EditUserValues,
  loadedUser: AdminUserResponse,
): UpdateAdminUserRequest {
  const payload: UpdateAdminUserRequest = {
    expectedUpdatedAt: loadedUser.updatedAt,
  };
  if (normalizeName(values.firstName) !== normalizeName(loadedUser.firstName)) {
    payload.firstName = normalizeName(values.firstName);
  }
  if (
    normalizeName(values.lastName) !== normalizeName(loadedUser.lastName ?? "")
  ) {
    payload.lastName = normalizeName(values.lastName);
  }
  if (
    normalizeName(values.displayName) !== normalizeName(loadedUser.displayName)
  ) {
    payload.displayName = normalizeName(values.displayName);
  }
  if (
    values.email.trim().toLowerCase() !== loadedUser.email.trim().toLowerCase()
  ) {
    payload.email = values.email.trim().toLowerCase();
  }
  return payload;
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
}

export type ChangePasswordField = keyof ChangePasswordValues;

export function hasChangePasswordChanges(
  values: ChangePasswordValues,
): boolean {
  return values.password !== "" || values.confirmPassword !== "";
}

export function validateChangePasswordField(
  field: ChangePasswordField,
  values: ChangePasswordValues,
  targetEmail: string,
): string | null {
  switch (field) {
    case "password":
      return validatePassword(values.password, targetEmail);
    case "confirmPassword":
      return validateConfirmPassword(values.confirmPassword, values.password);
  }
}


