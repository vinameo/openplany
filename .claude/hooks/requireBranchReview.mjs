// PreToolUse hook (Bash): a feature/fix/refactor/chore/review branch can be
// merged only after its whole-branch self-review (CLAUDE.md §8) is written to
// .claude/reviews/<branch with "/" as "__">.md, newer than the branch tip.
// A remote-tracking ref (origin/fix/x) is checked as the branch it names (fix/x).
// Claude Code runs it from .claude/settings.json, Antigravity from .agents/hooks.json.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  deny as denyFor,
  readHookInput,
  runGit,
  startWatchdog,
  warn,
} from "./hookIo.mjs";

const HOOK = "requireBranchReview";

const GUARDED = /^(feature|fix|refactor|chore|review)\//;
const OPTIONS_WITH_VALUE = new Set([
  "-m",
  "--message",
  "-s",
  "--strategy",
  "-X",
  "--strategy-option",
  "-F",
  "--file",
]);

function mergedBranches(command) {
  const branches = [];
  for (const match of command.matchAll(/\bgit\s+merge\b([^;&|]*)/g)) {
    const tokens = match[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    if (tokens.some((t) => ["--abort", "--continue", "--quit"].includes(t)))
      continue;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (OPTIONS_WITH_VALUE.has(token)) {
        i += 1;
        continue;
      }
      if (token.startsWith("-")) continue;
      branches.push(token.replace(/^["']|["']$/g, ""));
    }
  }
  return branches;
}

/**
 * The branch a merged ref stands for: `origin/fix/x`, `remotes/origin/fix/x`
 * and `refs/remotes/origin/fix/x` all name `fix/x`, so merging the remote ref
 * needs the same review as merging the local branch.
 */
function branchName(ref, remotes) {
  const bare = ref.replace(/^refs\/remotes\//, "").replace(/^remotes\//, "");
  const remote = remotes.find((r) => bare.startsWith(`${r}/`));
  return remote === undefined ? ref : bare.slice(remote.length + 1);
}

function listRemotes(root) {
  try {
    return runGit(root, ["remote"])
      .split("\n")
      .filter((r) => r !== "");
  } catch (error) {
    // Not a repo, git missing or too slow: only local branch names are checked.
    warn(HOOK, `git remote failed: ${error}`);
    return [];
  }
}

startWatchdog(HOOK);
const { antigravity, command, root } = await readHookInput(HOOK);
const deny = (reason) => denyFor(antigravity, reason);

if (command !== null) {
  const refs = mergedBranches(command);
  const remotes = refs.length > 0 ? listRemotes(root) : [];
  for (const ref of refs) {
    const branch = branchName(ref, remotes);
    if (!GUARDED.test(branch)) continue;
    const report = join(
      root,
      ".claude",
      "reviews",
      `${branch.replaceAll("/", "__")}.md`,
    );
    let tipSeconds;
    try {
      tipSeconds = Number(runGit(root, ["log", "-1", "--format=%ct", ref]));
    } catch (error) {
      // Unknown branch: git reports it. A git timeout cannot be checked either.
      warn(HOOK, `skipped ${ref}: ${error}`);
      continue;
    }
    if (!existsSync(report)) {
      deny(
        `Merge of ${ref} blocked: no self-review at ${report}. Review \`git diff develop...${ref}\` ` +
          `(design pass, OWASP list, duplication across tickets; CLAUDE.md §8), fix or list every finding in that file, then merge.`,
      );
      break;
    }
    if (statSync(report).mtimeMs / 1000 < tipSeconds) {
      deny(
        `Merge of ${ref} blocked: ${report} is older than the branch's last commit. ` +
          `Review the new commits and update the report, then merge.`,
      );
      break;
    }
  }
}
