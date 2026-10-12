// PreToolUse hook (Bash): a feature/fix/refactor/chore/review branch can be
// merged only after its whole-branch self-review (CLAUDE.md §8) is written to
// .claude/reviews/<branch with "/" as "__">.md, newer than the branch tip.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GUARDED = /^(feature|fix|refactor|chore|review)\//;
const OPTIONS_WITH_VALUE = new Set(['-m', '--message', '-s', '--strategy', '-X', '--strategy-option', '-F', '--file']);

function mergedBranches(command) {
  const branches = [];
  for (const match of command.matchAll(/\bgit\s+merge\b([^;&|]*)/g)) {
    const tokens = match[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
    if (tokens.some((t) => ['--abort', '--continue', '--quit'].includes(t))) continue;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (OPTIONS_WITH_VALUE.has(token)) {
        i += 1;
        continue;
      }
      if (token.startsWith('-')) continue;
      branches.push(token.replace(/^["']|["']$/g, ''));
    }
  }
  return branches;
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = input?.tool_input?.command;
if (typeof command === 'string') {
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  for (const branch of mergedBranches(command).filter((b) => GUARDED.test(b))) {
    const report = join(root, '.claude', 'reviews', `${branch.replaceAll('/', '__')}.md`);
    let tipSeconds;
    try {
      tipSeconds = Number(
        execFileSync('git', ['log', '-1', '--format=%ct', branch], { cwd: root, encoding: 'utf8' }).trim(),
      );
    } catch {
      continue; // Unknown branch: let git report it.
    }
    if (!existsSync(report)) {
      deny(
        `Merge of ${branch} blocked: no self-review at ${report}. Review \`git diff develop...${branch}\` ` +
          `(design pass, OWASP list, duplication across tickets; CLAUDE.md §8), fix or list every finding in that file, then merge.`,
      );
      break;
    }
    if (statSync(report).mtimeMs / 1000 < tipSeconds) {
      deny(
        `Merge of ${branch} blocked: ${report} is older than the branch's last commit. ` +
          `Review the new commits and update the report, then merge.`,
      );
      break;
    }
  }
}
