export function splitServerFieldErrors(
  fields: unknown,
  fieldNames: readonly string[],
): {
  fieldErrors: Record<string, string>;
  hiddenMessages: string[];
} {
  const fieldErrors: Record<string, string> = {};
  const hiddenMessages: string[] = [];

  if (typeof fields !== "object" || fields === null) {
    return { fieldErrors, hiddenMessages };
  }

  for (const [key, value] of Object.entries(fields)) {
    const message =
      typeof value === "string"
        ? value
        : Array.isArray(value) && typeof value[0] === "string"
          ? value[0]
          : null;

    if (!message) continue;

    if (fieldNames.includes(key)) {
      fieldErrors[key] = message;
    } else {
      hiddenMessages.push(message);
    }
  }

  return { fieldErrors, hiddenMessages };
}
