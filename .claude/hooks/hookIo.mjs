// Shared I/O for the PreToolUse (Bash) hooks. Claude Code runs them from
// .claude/settings.json, Antigravity from .agents/hooks.json; each sends its
// own payload and expects its own answer.
import { readFileSync } from "node:fs";

/** The shell command about to run (null when the tool call has none) and the repo root. */
export function readHookInput() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const antigravity = input?.toolCall !== undefined;
  const command = antigravity
    ? input.toolCall.args?.CommandLine
    : input?.tool_input?.command;
  const root = antigravity
    ? (input.workspacePaths?.[0] ?? process.cwd())
    : (process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd());
  return {
    antigravity,
    command: typeof command === "string" ? command : null,
    root,
  };
}

export function deny(antigravity, reason) {
  const answer = antigravity
    ? { decision: "deny", reason }
    : {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      };
  process.stdout.write(JSON.stringify(answer));
}
