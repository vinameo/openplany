import type { MessageRef } from "./catalog/types.js";

export const TIMEZONE_MESSAGES = {
  invalid: "Select a valid timezone",
} as const;

export const TIMEZONE_MESSAGE_REFS = {
  invalid: { key: "project:errors.timezoneInvalid" },
} as const satisfies Record<keyof typeof TIMEZONE_MESSAGES, MessageRef>;
