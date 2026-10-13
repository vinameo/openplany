/**
 * Matches user confirmation input against the expected project identifier.
 * Trims leading/trailing whitespace and is case-insensitive.
 */
export function matchesProjectIdentifier(
  input: string,
  expectedIdentifier: string,
): boolean {
  return input.trim().toUpperCase() === expectedIdentifier.trim().toUpperCase();
}
