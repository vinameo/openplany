import {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USER_NAME_ALLOWED,
  USER_NAME_MAX,
  normalizeName,
} from "@repo/contracts";

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
      if (normalized === "") return "Enter a first name";
      if (normalized.length > USER_NAME_MAX) {
        return `First name must be ${USER_NAME_MAX} characters or fewer`;
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return "Contains characters that aren't allowed";
      }
      return null;
    }

    case "lastName": {
      const normalized = normalizeName(values.lastName);
      if (normalized === "") return null;
      if (normalized.length > USER_NAME_MAX) {
        return `Last name must be ${USER_NAME_MAX} characters or fewer`;
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return "Contains characters that aren't allowed";
      }
      return null;
    }

    case "displayName": {
      const normalized = normalizeName(values.displayName);
      if (normalized === "") return "Enter a display name";
      if (normalized.length > USER_NAME_MAX) {
        return `Display name must be ${USER_NAME_MAX} characters or fewer`;
      }
      if (!USER_NAME_ALLOWED.test(normalized)) {
        return "Contains characters that aren't allowed";
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
        return "Enter a valid email";
      }
      return null;
    }

    case "password": {
      const pwd = values.password;
      if (pwd.length < PASSWORD_MIN || pwd.length > PASSWORD_MAX) {
        return `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`;
      }
      if (
        values.email.trim() !== "" &&
        pwd.toLowerCase() === values.email.trim().toLowerCase()
      ) {
        return "Password can't be the same as the email";
      }
      return null;
    }

    case "confirmPassword": {
      if (
        values.confirmPassword === "" ||
        values.confirmPassword !== values.password
      ) {
        return "Passwords don't match";
      }
      return null;
    }
  }
}

