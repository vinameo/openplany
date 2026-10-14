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

export const changeRoleFailed = translate("members:changeRoleFailed");
export const CHANGE_ROLE_FAILED = changeRoleFailed;

export function andMore(count: number): string {
  return translate("members:cell.andMore", { count });
}

export function hiddenProjects(count: number): string {
  return translate("members:cell.hiddenProjects", { count });
}

export const MEMBERS_MESSAGES = {
  get couldntLoadMembers(): string {
    return translate("workspace:settings.members.loadError");
  },
  get tryAgain(): string {
    return translate("common:actions.tryAgain");
  },
  get noMembersMatch(): string {
    return translate("members:noMembersMatch");
  },
  get clearSearchAndFilters(): string {
    return translate("members:clearSearchAndFilters");
  },
  get somethingWentWrong(): string {
    return translate("errors:genericError");
  },
};

export const COULDNT_LOAD_MEMBERS = translate("workspace:settings.members.loadError");
export const TRY_AGAIN = translate("common:actions.tryAgain");
export const NO_MEMBERS_MATCH = translate("members:noMembersMatch");
export const CLEAR_SEARCH_AND_FILTERS = translate("members:clearSearchAndFilters");
export const SOMETHING_WENT_WRONG = translate("errors:genericError");

