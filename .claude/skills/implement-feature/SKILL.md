---
name: implement-feature
description: Implement every ticket of an OpenPlany feature spec in order, one deep-coder subagent per ticket, then self-review the whole branch and merge it into develop. Use when the user passes a packages/docs/<n>-<feature> path and asks to implement or code the whole feature.
argument-hint: <packages/docs/n-feature path, or just the number>
disable-model-invocation: true
---

# Implement a feature

Target: `$ARGUMENTS`

You orchestrate the work. The `deep-coder` subagent implements each ticket. You own the branch, the order, the code reviews and the merge.

## 1. Resolve the feature

- The target can be an absolute path, a path relative to the repo, a directory name (`12-add-member-to-project`) or a number (`12`). Resolve it to one directory `packages/docs/<n>-<feature>/`.
- That directory must contain `tickets/README.md`. If it does not, stop and suggest the `write-feature-spec` skill.
- Read `tickets/README.md`: the ticket table (Blocked by, Status), "Thứ tự làm" and "Quyết định nền". Find the tracer-bullet ticket (its name or the order section says "tracer").

Done when you have the ticket order and the tracer ticket.

## 2. Branch

Follow CLAUDE.md §8 "Branch workflow for agents" for `feature/<docs-dir>`. If the tree is dirty, stop and ask the user.

## 3. Skip finished tickets

If the branch already exists, run `git log develop..HEAD` and read the ticket statuses. A ticket is finished when its commit is on the branch. List the skipped tickets to the user, then continue with the first unfinished one.

## 4. One ticket at a time

Run tickets in the order from step 1, one after another. Do not run them in parallel: they share one working tree. For each ticket:

1. Start `deep-coder` in the foreground. Pass the feature directory, the ticket path, the branch name, whether this is the tracer ticket, and the "Quyết định nền" table.
2. When it returns, check its report against `git log -1` and `git status`. The commit must exist and the tree must be clean.
3. If it reports red checks, a blocker or no commit, stop and report to the user. Do not start the next ticket.
4. After the tracer ticket, run `/code-review` on the branch (`develop...HEAD`). Send each finding to `deep-coder` to fix and commit, or record why you skip it. Later tickets copy what the tracer sets up.

Give the user one line after each ticket: the ticket, the commit, any deviation.

## 5. Whole-branch review

After the last ticket, do "Last ticket of the feature" from the `implement-ticket` skill:

1. Run `/code-review` on `develop...HEAD` and `/security-review` (OWASP Top 10). Also check by hand for two implementations of the same idea across tickets, and for every AC in `1-requirement-spec.md` that has no test.
2. Fix the findings through `deep-coder`, or record each skipped finding with a reason.
3. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm dup` and `pnpm --filter @repo/api test:e2e`.
4. Write `.claude/reviews/<branch with "/" as "__">.md` after the last commit.
5. Merge as described in CLAUDE.md §8 step 3. Do not push.

## Final report

Give the commits per ticket, the spec deviations, the review findings (fixed or deferred with a reason), the check results and the merge commit.
