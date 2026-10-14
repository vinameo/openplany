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

export function validateCreateUserField(
  field: CreateUserField,
  values: CreateUserValues,
): string | null {
  switch (field) {
    case "firstName": {
      const normalized = normalizeName(values.firstName);
      if (normalized === "") {
        return translate("admin:users.validation.enterFirstName");
      }
      if (normalized.length > USER_NAME_MAX) {
        return translate("admin:users.validation.firstNameMax", {
          max: USER_NAME_MAX,
        });
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return translate("admin:users.validation.disallowedCharacters");
      }
      return null;
    }

    case "lastName": {
      const normalized = normalizeName(values.lastName);
      if (normalized === "") return null;
      if (normalized.length > USER_NAME_MAX) {
        return translate("admin:users.validation.lastNameMax", {
          max: USER_NAME_MAX,
        });
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return translate("admin:users.validation.disallowedCharacters");
      }
      return null;
    }

    case "displayName": {
      const normalized = normalizeName(values.displayName);
      if (normalized === "") {
        return translate("admin:users.validation.enterDisplayName");
      }
      if (normalized.length > USER_NAME_MAX) {
        return translate("admin:users.validation.displayNameMax", {
          max: USER_NAME_MAX,
        });
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return translate("admin:users.validation.disallowedCharacters");
      }
      return null;
    }

    case "email": {
      const trimmed = values.email.trim();
      if (
        trimmed === "" ||
        !EMAIL_REGEX.test(trimmed) ||
        trimmed.length > EMAIL_MAX
      ) {
        return translate("admin:users.validation.invalidEmail");
      }
      return null;
    }

    case "password": {
      const pwd = values.password;
      if (pwd.length < PASSWORD_MIN || pwd.length > PASSWORD_MAX) {
        return translate("admin:users.validation.passwordLength", {
          min: PASSWORD_MIN,
          max: PASSWORD_MAX,
        });
      }
      if (
        values.email.trim() !== "" &&
        pwd.toLowerCase() === values.email.trim().toLowerCase()
      ) {
        return translate("admin:users.validation.passwordSameAsEmail");
      }
      return null;
    }

    case "confirmPassword": {
      if (
        values.confirmPassword === "" ||
        values.confirmPassword !== values.password
      ) {
        return translate("admin:users.validation.passwordsDoNotMatch");
      }
      return null;
    }
  }
}
