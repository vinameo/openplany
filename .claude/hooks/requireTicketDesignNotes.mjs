// PreToolUse hook (Bash): on feature/<docs-dir>, a ticket commit needs design
// notes (implement-ticket step 4) written since the last commit:
// packages/docs/<docs-dir>/tickets/NN-<slug>.design.md, one table row per spec
// sketch or rule the ticket builds on, every cell filled with evidence.
// Commits of type review/docs/chore/style/ci/build and --amend pass through.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { deny, readHookInput, runGit, startWatchdog, warn } from "./hookIo.mjs";

const HOOK = "requireTicketDesignNotes";

const DESIGN_NOTES_COLUMNS = [
  "Sketch or rule (spec §)",
  "Invariant (INV/AC)",
  "Checked against (code/DB)",
  "Changes between read and write",
  "Deleted or inactive rows",
  "Same rule elsewhere",
  "Verdict",
];
const EXEMPT_TYPES = new Set([
  "review",
  "docs",
  "chore",
  "style",
  "ci",
  "build",
]);
const PLACEHOLDER = /^(-+|—|–|\?+|n\/?a|none|no|todo|tbd|\.\.\.|…)$/i;
const CHECKED_AGAINST = 2;
const VERDICT = DESIGN_NOTES_COLUMNS.length - 1;

/** Subject line of `-m "…"` or of a heredoc message; null when it cannot be read. */
function commitSubject(command) {
  // Heredoc first: `-m "$(cat <<'EOF' … EOF)"` also matches the inline form.
  const heredoc = command.match(
    /<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\s*\1\b/,
  );
  if (heredoc) {
    return (
      heredoc[2]
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l !== "") ?? null
    );
  }
  const inline = command.match(/\s(?:-m|--message)(?:=|\s+)(["'])([\s\S]*?)\1/);
  if (inline) return inline[2].trim().split("\n")[0];
  return null;
}

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Problems in a design notes file; [] when it is complete. */
function designNotesProblems(text) {
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));
  const headerAt = lines.findIndex(
    (l) =>
      cells(l)
        .map((c) => c.toLowerCase())
        .join("|") ===
      DESIGN_NOTES_COLUMNS.map((c) => c.toLowerCase()).join("|"),
  );
  if (headerAt === -1) {
    return [`no table with the header | ${DESIGN_NOTES_COLUMNS.join(" | ")} |`];
  }
  const rows = lines.slice(headerAt + 2).map(cells);
  if (rows.length === 0) return ["the table has no rows"];

  const problems = [];
  rows.forEach((row, i) => {
    const at = `row ${i + 1}`;
    if (row.length !== DESIGN_NOTES_COLUMNS.length) {
      problems.push(
        `${at}: ${row.length} cells, expected ${DESIGN_NOTES_COLUMNS.length}`,
      );
      return;
    }
    row.forEach((cell, c) => {
      if (cell === "" || PLACEHOLDER.test(cell)) {
        problems.push(
          `${at}, "${DESIGN_NOTES_COLUMNS[c]}": "${cell}" is not evidence; write what you checked (e.g. "none: grep \`foo\` finds only this file")`,
        );
      }
    });
    if (!row[CHECKED_AGAINST].includes("`")) {
      problems.push(
        `${at}, "${DESIGN_NOTES_COLUMNS[CHECKED_AGAINST]}": cite the code or query you read, in backticks (\`file.ts:42\`)`,
      );
    }
    if (!/^(follow|deviate)\b/i.test(row[VERDICT])) {
      problems.push(
        `${at}, "Verdict": start with "follow" or "deviate: <reason>"`,
      );
    }
  });
  return problems;
}

function check(command, root) {
  if (!/\bgit\s+(?:-C\s+\S+\s+)?commit\b/.test(command)) return null;
  if (/\s--amend\b/.test(command)) return null;

  const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.startsWith("feature/")) return null;
  const docsDir = branch.slice("feature/".length);
  const ticketsDir = join(root, "packages", "docs", docsDir, "tickets");
  if (!existsSync(ticketsDir)) return null;

  const type = commitSubject(command)?.match(/^(\w+)[(!:]/)?.[1];
  if (type !== undefined && EXEMPT_TYPES.has(type)) return null;

  const headSeconds = Number(runGit(root, ["log", "-1", "--format=%ct"]));
  const fresh = readdirSync(ticketsDir)
    .filter((f) => f.endsWith(".design.md"))
    .map((f) => ({ f, mtime: statSync(join(ticketsDir, f)).mtimeMs / 1000 }))
    .filter(({ mtime }) => mtime > headSeconds)
    .sort((a, b) => b.mtime - a.mtime);

  if (fresh.length === 0) {
    return (
      `Commit blocked: no design notes written since the last commit in ${ticketsDir}. ` +
      `Before a ticket commit, write tickets/NN-<slug>.design.md (implement-ticket step 4): every spec sketch is a hypothesis; ` +
      `give each sketch or rule the ticket builds on one row of | ${DESIGN_NOTES_COLUMNS.join(" | ")} |. ` +
      `Review fixes and docs commits use the review(...)/docs(...) types and pass.`
    );
  }
  const newest = join(ticketsDir, fresh[0].f);
  const problems = designNotesProblems(readFileSync(newest, "utf8"));
  if (problems.length > 0) {
    return `Commit blocked: ${newest} is incomplete:\n- ${problems.join("\n- ")}`;
  }
  return null;
}

startWatchdog(HOOK);
const { antigravity, command, root } = await readHookInput(HOOK);
if (command !== null) {
  let reason = null;
  try {
    reason = check(command, root);
  } catch (err) {
    // A git failure (no repo, no commits yet, timeout) is git's to report, not this hook's.
    warn(HOOK, `skipped (${err instanceof Error ? err.message : String(err)})`);
  }
  if (reason !== null) deny(antigravity, reason);
}
