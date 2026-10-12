import { PROJECT_IDENTIFIER_PATTERN } from "@repo/contracts";
import { workspacePath } from "../workspaces/workspacePaths";

/** The Project home of one project. */
export function projectPath(workspaceSlug: string, identifier: string): string {
  return `${workspacePath(workspaceSlug)}/projects/${encodeURIComponent(identifier)}`;
}

export type CanonicalProjectIdentifier =
  | { kind: "canonical"; identifier: string }
  | { kind: "redirect"; identifier: string }
  | { kind: "invalid" };

/** RQ D10: viết hoa rồi so PROJECT_IDENTIFIER_PATTERN (từ @repo/contracts). */
export function canonicalProjectIdentifier(
  raw: string,
): CanonicalProjectIdentifier {
  if (PROJECT_IDENTIFIER_PATTERN.test(raw)) {
    return { kind: "canonical", identifier: raw };
  }
  const upper = raw.toUpperCase();
  if (PROJECT_IDENTIFIER_PATTERN.test(upper)) {
    return { kind: "redirect", identifier: upper };
  }
  return { kind: "invalid" };
}
