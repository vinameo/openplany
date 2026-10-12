---
name: implement-ticket
description: Implement one ticket of an OpenPlany feature (packages/docs/<n>-<feature>/tickets/NN-*.md) on its feature branch, from design pass to commit; on the last ticket, self-review the whole branch and merge. Use when asked to implement, code or build a ticket or a feature spec.
---

# Implement a ticket

## Steps

1. **Branch.** Follow CLAUDE.md §8 "Branch workflow for agents". Done when you are on `feature/<docs-dir>` with a clean tree.
2. **Read.** The ticket, every spec section it cites, the tickets that block it (their code is now in the branch), and the code it touches. Done when you can name each file you will change and the existing shared piece each change builds on.
3. **Design pass.** Hold the ticket and its spec sketches to the design pass in CLAUDE.md §8. Write down every point where the sound design differs from the spec. Done when each design-pass item is either satisfied or listed as a deviation.
4. **Prefactor first.** If the change would copy existing code, extract the shared piece in its own commit with no behaviour change, and show existing tests green.
5. **Build with tests.** Implement the ticket and test its ACs, plus:
   - a new or changed JSON write endpoint gets a case in `apps/api/test/adversarialInputs.e2e-spec.ts`;
   - a new migration is added to `MIGRATIONS` in `apps/api/test/e2eGlobalSetup.ts` (the migrations e2e suite then reverts it over realistic data);
   - a new route under `/workspaces/:slug` or `/projects/:identifier` uses the existing guards (`apps/api/src/architecture.spec.ts` fails otherwise).
6. **Check.** `pnpm lint && pnpm typecheck && pnpm test && pnpm dup`, plus `pnpm --filter @repo/api test:e2e` for API changes, and Prettier on the files you touched. Done when all are green.
7. **Commit** one Conventional Commit per ticket; the body names every spec deviation from step 3. Update the spec files for each deviation.
8. **After the tracer-bullet ticket**, run `/code-review` on the branch and fix its findings before starting the next ticket: later tickets copy whatever the tracer establishes.

## Last ticket of the feature

1. Review `git diff develop...HEAD` as a whole against the design pass, the OWASP list (CLAUDE.md §5) and §7, looking specifically for two implementations of the same idea across tickets. Prefer `/code-review` on the branch.
2. Fix each finding, or record it with a reason. Write the review to `.claude/reviews/<branch with "/" as "__">.md`: findings, what was fixed, what was deferred and why.
3. Re-run step 6, then merge as in CLAUDE.md §8. The merge hook refuses a branch whose review report is missing or older than its last commit; write the report after the final commit.
