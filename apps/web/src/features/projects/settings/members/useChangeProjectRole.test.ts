import { describe, expect, it } from "vitest";
import { MEMBER_MESSAGES, PROJECT_ROLE_CHANGE_MESSAGES } from "@repo/contracts";
import { ApiRequestError } from "../../../../lib/apiClient";
import { getProjectRoleChangeErrorMessage } from "./useChangeProjectRole";

describe("getProjectRoleChangeErrorMessage", () => {
  it("picks the sentence from the code, not from the server message", () => {
    expect(
      getProjectRoleChangeErrorMessage(
        new ApiRequestError(403, {
          code: "ROLE_NOT_ALLOWED",
          message: "anything the server says",
        }),
      ),
    ).toEqual({ message: MEMBER_MESSAGES.roleNotAllowed, shouldReload: true });

    expect(
      getProjectRoleChangeErrorMessage(
        new ApiRequestError(403, {
          code: "FORBIDDEN",
          message: MEMBER_MESSAGES.roleNotAllowed,
        }),
      ),
    ).toEqual({
      message: PROJECT_ROLE_CHANGE_MESSAGES.cantChange,
      shouldReload: true,
    });
  });
});
