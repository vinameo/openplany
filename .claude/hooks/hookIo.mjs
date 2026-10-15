// Shared I/O for the PreToolUse (Bash) hooks. Claude Code runs them from
// .claude/settings.json, Antigravity from .agents/hooks.json; each sends its
// own payload and expects its own answer.
//
// A hook must never hang: it reads stdin with a deadline, runs git with a
// timeout and no stdin, and a watchdog ends the process. When there is no
// readable input there is no command to check, so the hook allows the call.
import { execFileSync } from "node:child_process";

export const STDIN_TIMEOUT_MS = 2_000;
export const GIT_TIMEOUT_MS = 5_000;
export const WATCHDOG_MS = 8_000;

/** @param {string} hook @param {string} message */
export function warn(hook, message) {
  process.stderr.write(`${hook}: ${message}\n`);
}

/**
 * Ends the process (allowing the call) if the hook is still running after `ms`.
 * @param {string} hook @param {number} [ms]
 */
export function startWatchdog(hook, ms = WATCHDOG_MS) {
  setTimeout(() => {
    warn(hook, `still running after ${ms} ms; allowing the command`);
    process.exit(0);
  }, ms).unref();
}

/**
 * All of stdin as text, or null when it is a terminal, errors, or sends no EOF within `timeoutMs`.
 * @param {NodeJS.ReadStream} stdin @param {number} timeoutMs
 * @returns {Promise<string | null>}
 */
function readStdin(stdin, timeoutMs) {
  if (stdin.isTTY) return Promise.resolve(null);
  return new Promise((resolve) => {
    /** @type {Buffer[]} */
    const chunks = [];
    /** @param {string | null} value */
    const finish = (value) => {
      clearTimeout(timer);
      stdin.removeAllListeners("data");
      stdin.removeAllListeners("end");
      stdin.removeAllListeners("error");
      resolve(value);
    };
    const timer = setTimeout(() => {
      // Let the event loop finish even though the writer never closed stdin.
      stdin.destroy();
      finish(null);
    }, timeoutMs);
    stdin.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    stdin.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
    stdin.on("error", () => finish(null));
  });
}

/**
 * The shell command about to run (null when there is none to check) and the
 * repo root. Never throws and never waits longer than `timeoutMs` for input.
 * @param {string} hook
 * @param {{ stdin?: NodeJS.ReadStream, timeoutMs?: number }} [options]
 */
export async function readHookInput(
  hook,
  { stdin = process.stdin, timeoutMs = STDIN_TIMEOUT_MS } = {},
) {
  const fallbackRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const none = { antigravity: false, command: null, root: fallbackRoot };

  const text = await readStdin(stdin, timeoutMs);
  if (text === null) {
    warn(
      hook,
      stdin.isTTY
        ? "stdin is a terminal, no hook payload; nothing to check"
        : `no hook payload within ${timeoutMs} ms; nothing to check`,
    );
    return none;
  }
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    warn(
      hook,
      `hook payload is not JSON (${error instanceof Error ? error.message : String(error)}); nothing to check`,
    );
    return none;
  }

  const antigravity = input?.toolCall !== undefined;
  const command = antigravity
    ? input.toolCall.args?.CommandLine
    : input?.tool_input?.command;
  const root = antigravity
    ? (input.workspacePaths?.[0] ?? process.cwd())
    : (process.env.CLAUDE_PROJECT_DIR ?? input?.cwd ?? process.cwd());
  return {
    antigravity,
    command: typeof command === "string" ? command : null,
    root,
  };
}

/**
 * `git <args>` in `root`, trimmed; throws on failure or after GIT_TIMEOUT_MS. Git gets no stdin.
 * @param {string} root @param {string[]} args
 */
export function runGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: GIT_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** @param {boolean} antigravity @param {string} reason */
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
