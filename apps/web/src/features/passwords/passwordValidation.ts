import { PASSWORD_MAX, PASSWORD_MIN } from "@repo/contracts";
import { translate } from "../../i18n/index.js";

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
    return translate("users:errors.passwordsDoNotMatch");
  }
  return null;
}

export function validatePasswordNotCurrent(
  newPassword: string,
  currentPassword: string,
): string | null {
  if (currentPassword !== "" && newPassword === currentPassword) {
    return translate("users:errors.passwordSameAsCurrent");
  }
  return null;
}
