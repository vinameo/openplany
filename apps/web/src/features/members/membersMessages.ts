export const COULDNT_LOAD_MEMBERS = "Couldn't load members.";
export const TRY_AGAIN = "Try again";
export const NO_MEMBERS_MATCH = "No members match your search";
export const CLEAR_SEARCH_AND_FILTERS = "Clear search and filters";
export const SOMETHING_WENT_WRONG = "Something went wrong. Please try again.";

export function addedMembersMessage(count: number): string {
  return count === 1 ? "Added 1 member" : `Added ${count} members`;
}

export function tooManyAttemptsMessage(seconds: number | null): string {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return `Too many attempts. Try again in ${seconds} seconds.`;
  }
  return "Too many attempts. Try again later.";
}

export function tooManySearchesMessage(seconds: number | null): string {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return `Too many searches. Try again in ${seconds} seconds.`;
  }
  return "Too many searches. Try again later.";
}

export function roleSelectLabel(memberName: string): string {
  return `Role for ${memberName}`;
}

export const changeRoleFailed = "Couldn't change the role. Try again.";
export const CHANGE_ROLE_FAILED = changeRoleFailed;

export function andMore(count: number): string {
  return `and ${count} more`;
}

export function hiddenProjects(count: number): string {
  return count === 1
    ? "and 1 project you can't see"
    : `and ${count} projects you can't see`;
}
