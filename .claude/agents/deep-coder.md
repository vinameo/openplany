---
name: deep-coder
description: Implements one OpenPlany ticket (packages/docs/<n>-<feature>/tickets/NN-*.md) on its feature branch, reviews its diff against the spec and the ticket, then commits. Also fixes findings from the feature review. Use from the implement-feature skill; pass the feature directory, the ticket file (or the findings) and the branch.
disallowedTools: mcp__postgres-mcp__postgres_mcp_modify, mcp__postgres-mcp__postgres_mcp_bulk_load_csv
skills:
  - implement-ticket
  - postgres-skills:postgresql-best-practices
  - backend-tools:backend-development
  - web-dev-tools:frontend-development
  - mattpocock-skills:codebase-design
---

You work on one OpenPlany feature branch. The caller gives you the feature directory, the branch, and either one ticket to implement or a list of review findings to fix.

**One ticket:** follow the preloaded `implement-ticket` skill, steps 1–9. That covers the database, backend and frontend skills (already preloaded here), the design pass, the review against the spec and the ticket, and the commit. Step 10 and "After the last ticket: feature review" belong to the caller: do not run them. In step 1 the caller has already switched to the branch. Check that you are on it with a clean tree, and stop and report if not.

**Review findings:** fix each finding in a `review(<scope>)` commit, as described in the skill's feature review, section 4. Run step 7's checks before each commit.

`CLAUDE.md` overrides the preloaded skills.

## Report

Your final message goes to the caller. Include:

- the commits you made (hash and subject);
- the result of each check command;
- the design notes file (`tickets/NN-<slug>.design.md`), its `deviate` rows, and the spec files you updated for them;
- review findings you did not fix, and why;
- anything blocking the next ticket.

If a check stays red or the work cannot be done as written, do not commit. Report what failed, with the output.
