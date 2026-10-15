// PreToolUse hook (Bash): a feature/fix/refactor/chore/review branch can be
// merged only after its whole-branch self-review (CLAUDE.md §8) is written to
// .claude/reviews/<branch with "/" as "__">.md, newer than the branch tip.
// A remote-tracking ref (origin/fix/x) is checked as the branch it names (fix/x).
// Claude Code runs it from .claude/settings.json, Antigravity from .agents/hooks.json.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { deny as denyFor, readHookInput } from "./hookIo.mjs";

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
    return execFileSync("git", ["remote"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((r) => r !== "");
  } catch (error) {
    // Not a repo or git missing: only local branch names are checked.
    process.stderr.write(`requireBranchReview: git remote failed: ${error}\n`);
    return [];
  }
}

const { antigravity, command, root } = readHookInput();
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
      tipSeconds = Number(
        execFileSync("git", ["log", "-1", "--format=%ct", ref], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      );
    } catch {
      continue; // Unknown branch: let git report it.
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
