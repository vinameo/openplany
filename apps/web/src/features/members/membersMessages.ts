import { translate } from "../../i18n/language";

export function addedMembersMessage(count: number): string {
  return translate("members:addedCount", { count });
}

export function tooManyAttemptsMessage(seconds: number | null): string {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return translate("members:tooManyAttempts", { count: seconds });
  }
  return translate("members:tooManyAttemptsLater");
}

export function tooManySearchesMessage(seconds: number | null): string {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return translate("members:tooManySearches", { count: seconds });
  }
  return translate("members:tooManySearchesLater");
}

export function roleSelectLabel(memberName: string): string {
  return translate("members:cell.roleForMember", { name: memberName });
}

export function changeRoleFailedMessage(): string {
  return translate("members:changeRoleFailed");
}

export function andMore(count: number): string {
  return translate("members:cell.andMore", { count });
}

export function hiddenProjects(count: number): string {
  return translate("members:cell.hiddenProjects", { count });
}
