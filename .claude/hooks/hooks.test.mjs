// Tests for the PreToolUse hooks. Run with `pnpm test:hooks` (node:test).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readHookInput } from "./hookIo.mjs";

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const BRANCH_REVIEW = join(HOOKS_DIR, "requireBranchReview.mjs");
const DESIGN_NOTES = join(HOOKS_DIR, "requireTicketDesignNotes.mjs");
// Built at runtime so this file never reads as a merge command itself.
const MERGE = ["git", "merge"].join(" ");

/** @param {string} text */
function stdinWith(text) {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
}

/**
 * Runs a hook as Claude Code does. `input` null keeps stdin open without data.
 * @param {string} script @param {string | null} input @param {Record<string, string>} [env]
 */
function runHook(script, input, env = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    if (input !== null) child.stdin.end(input);
    // Safety net for the test run itself; a passing hook exits long before.
    const kill = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.on("close", (code) => {
      clearTimeout(kill);
      child.stdin.destroy();
      resolve({ code, stdout, stderr, ms: Date.now() - started });
    });
  });
}

/** @param {string} root @param {string} command */
const claudePayload = (root, command) =>
  JSON.stringify({ tool_input: { command }, cwd: root });

/** @param {string} cwd @param {string[]} args */
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

/** A repo on `branch` with one commit; returns its path. @param {string} branch */
function makeRepo(branch) {
  const root = mkdtempSync(join(tmpdir(), "hooks-test-"));
  git(root, ["init", "-q", "-b", "develop"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "a.txt"), "a");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "chore: init"]);
  if (branch !== "develop") git(root, ["switch", "-q", "-c", branch]);
  return root;
}

describe("readHookInput", () => {
  /** @type {string | undefined} */
  let savedDir;
  before(() => {
    savedDir = process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CLAUDE_PROJECT_DIR;
  });
  after(() => {
    if (savedDir !== undefined) process.env.CLAUDE_PROJECT_DIR = savedDir;
  });

  it("reads the Claude Code payload", async () => {
    const input = await readHookInput("test", {
      stdin: stdinWith(claudePayload("/repo", "git status")),
    });
    assert.deepEqual(input, {
      antigravity: false,
      command: "git status",
      root: "/repo",
    });
  });

  it("reads the Antigravity payload", async () => {
    const input = await readHookInput("test", {
      stdin: stdinWith(
        JSON.stringify({
          toolCall: { args: { CommandLine: "git status" } },
          workspacePaths: ["/ws"],
        }),
      ),
    });
    assert.deepEqual(input, {
      antigravity: true,
      command: "git status",
      root: "/ws",
    });
  });

  it("gives up on stdin that never ends, after the timeout", async () => {
    const started = Date.now();
    const input = await readHookInput("test", {
      stdin: new PassThrough(),
      timeoutMs: 200,
    });
    assert.equal(input.command, null);
    assert.ok(Date.now() - started < 1_000);
  });

  it("does not read a terminal", async () => {
    const tty = Object.assign(new PassThrough(), { isTTY: true });
    const input = await readHookInput("test", { stdin: tty, timeoutMs: 5_000 });
    assert.equal(input.command, null);
  });

  it("treats empty or non-JSON input as nothing to check", async () => {
    for (const text of ["", "not json", "{"]) {
      const input = await readHookInput("test", { stdin: stdinWith(text) });
      assert.equal(input.command, null, JSON.stringify(text));
    }
  });
});

for (const script of [BRANCH_REVIEW, DESIGN_NOTES]) {
  describe(script.split("/").pop() ?? script, () => {
    it("exits 0 within a few seconds when stdin stays open without data", async () => {
      const result = await runHook(script, null);
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /no hook payload/);
      assert.ok(result.ms < 5_000, `took ${result.ms} ms`);
    });

    it("exits 0 without denying on non-JSON input", async () => {
      const result = await runHook(script, "not json");
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
    });
  });
}

describe("requireBranchReview", () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let remote;
  before(() => {
    root = makeRepo("fix/local");
    remote = mkdtempSync(join(tmpdir(), "hooks-remote-"));
    git(remote, ["init", "-q", "--bare"]);
    git(root, ["remote", "add", "origin", remote]);
    git(root, ["switch", "-q", "-c", "fix/remote-only"]);
    git(root, ["push", "-q", "origin", "fix/remote-only"]);
    git(root, ["switch", "-q", "develop"]);
    git(root, ["branch", "-q", "-D", "fix/remote-only"]);
  });
  after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(remote, { recursive: true, force: true });
  });

  /** @param {string} target */
  const merge = (target) =>
    runHook(BRANCH_REVIEW, claudePayload(root, `${MERGE} --no-ff ${target}`), {
      CLAUDE_PROJECT_DIR: root,
    });

  it("denies a guarded branch without a report", async () => {
    const result = await merge("fix/local");
    assert.match(result.stdout, /"permissionDecision":"deny"/);
  });

  it("denies a remote-tracking ref of a guarded branch without a report", async () => {
    for (const ref of [
      "origin/fix/remote-only",
      "remotes/origin/fix/remote-only",
      "refs/remotes/origin/fix/remote-only",
    ]) {
      const result = await merge(ref);
      assert.match(result.stdout, /fix__remote-only\.md/, ref);
    }
  });

  it("allows a guarded branch whose report is newer than its tip", async () => {
    mkdirSync(join(root, ".claude", "reviews"), { recursive: true });
    writeFileSync(join(root, ".claude", "reviews", "fix__local.md"), "ok");
    const result = await merge("fix/local");
    assert.equal(result.stdout, "");
  });

  it("allows branches outside the guarded prefixes", async () => {
    const result = await merge("origin/develop");
    assert.equal(result.stdout, "");
  });
});

describe("requireTicketDesignNotes", () => {
  /** @type {string} */
  let root;
  before(() => {
    root = makeRepo("feature/1-sample");
    mkdirSync(join(root, "packages", "docs", "1-sample", "tickets"), {
      recursive: true,
    });
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  /** @param {string} message */
  const commit = (message) =>
    runHook(DESIGN_NOTES, claudePayload(root, `git commit -m "${message}"`), {
      CLAUDE_PROJECT_DIR: root,
    });

  it("denies a ticket commit without design notes", async () => {
    const result = await commit("feat(api): add sample");
    assert.match(result.stdout, /"permissionDecision":"deny"/);
  });

  it("allows exempt commit types", async () => {
    const result = await commit("chore(repo): tidy");
    assert.equal(result.stdout, "");
  });
});
