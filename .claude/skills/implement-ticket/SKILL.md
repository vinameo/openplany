---
name: implement-ticket
description: Implement one ticket of an OpenPlany feature (packages/docs/<n>-<feature>/tickets/NN-*.md) on its feature branch, from design pass to a commit reviewed against the spec and ticket; after the last ticket, review the whole feature (spec, SOLID, OWASP Top 10, extensibility), fix the findings and merge. Use when asked to implement, code or build a ticket or a feature spec.
---

# Implement a ticket

## Steps

1. **Branch.** Follow CLAUDE.md §8 "Branch workflow for agents". Done when you are on `feature/<docs-dir>` with a clean tree.
2. **Read.** The ticket, every spec section it cites, the tickets that block it (their code is now in the branch), and the code it touches. Done when you can name each file you will change and the existing shared piece each change builds on.
3. **Load skills.** For each layer the ticket touches, load the installed skill with the Skill tool, unless it is already preloaded (as in the `deep-coder` subagent):

   | Layer                                            | Skill                                       |
   | ------------------------------------------------ | ------------------------------------------- |
   | Database: entity, query, index, migration        | `postgres-skills:postgresql-best-practices` |
   | API: controller, service, DTO, guard, repository | `backend-tools:backend-development`         |
   | Web: page, component, hook, query                | `web-dev-tools:frontend-development`        |

   CLAUDE.md overrides these skills where they disagree. For example, the web app uses Mantine, react-router and TanStack Query, not MUI or TanStack Router. Before you write an entity, query or migration, inspect the real schema, indexes and rows with the read-only `open-plany-postgres` MCP tool (`mcp__open-plany-postgres__query`). Never write to the database through an MCP tool; change the schema only through migrations.

4. **Design pass: every sketch is a hypothesis.** The spec's code, queries, locks and algorithm steps, and the function names and step orders in the ticket, were written without running code. The requirement is the INVs, ACs and copy they serve. Test each hypothesis against the code at HEAD, the real schema and rows, and the design pass in CLAUDE.md §8. Then write `packages/docs/<n>-<feature>/tickets/NN-<slug>.design.md` with this table, one row per sketch or rule the ticket builds on:

   | Sketch or rule (spec §) | Invariant (INV/AC) | Checked against (code/DB) | Changes between read and write | Deleted or inactive rows | Same rule elsewhere | Verdict |
   | ----------------------- | ------------------ | ------------------------- | ------------------------------ | ------------------------ | ------------------- | ------- |
   - **Sketch or rule:** where it is (`API B4.2`, `DB B5.1`) and what it says, in one line.
   - **Invariant:** the INV or AC it serves. When the spec states none, write the one the sketch needs and mark it `(added)`.
   - **Checked against:** the `file:line` or query you read at HEAD, in backticks. When the spec's "current state" names a commit older than HEAD, read `git diff <that commit>..HEAD` on the files it cites.
   - **Changes between read and write:** what another request can commit between the read that decides and the write (a role change, a delete, the same write twice), and which read the decision uses: a row locked in the same transaction, or a value from the guard.
   - **Deleted or inactive rows:** soft-deleted rows, deactivated accounts, ended memberships, and how each is excluded or answered.
   - **Same rule elsewhere:** the existing helper, or the other place in the spec or code that states the same rule, and the one seam both will use.
   - **Verdict:** `follow`, or `deviate: <the sound version>`.

   A deviation that keeps every AC, permission and user-facing text is yours to build: build it, test it, name it in the commit body (step 9). Stop and ask the user only when the sound version changes what users see. Done when every sketch and rule the ticket cites has a row and every cell holds evidence. The `requireTicketDesignNotes` commit hook refuses a ticket commit without notes written since the last commit, or with an empty or placeholder cell.

5. **Prefactor first.** If the change would copy existing code, extract the shared piece in its own commit with no behaviour change, and show existing tests green.
6. **Build with tests.** Implement the ticket and test its ACs, plus:
   - a new or changed JSON write endpoint gets a case in `apps/api/test/adversarialInputs.e2e-spec.ts`;
   - a new migration is added to `MIGRATIONS` in `apps/api/test/e2eGlobalSetup.ts` (the migrations e2e suite then reverts it over realistic data);
   - a new route under `/workspaces/:slug` or `/projects/:identifier` uses the existing guards (`apps/api/src/architecture.spec.ts` fails otherwise).
7. **Check.** `pnpm lint && pnpm typecheck && pnpm test && pnpm dup`, plus `pnpm --filter @repo/api test:e2e` for API changes, and Prettier on the files you touched. Done when all are green.
8. **Review against the spec and the ticket.** Read `git diff` (staged and unstaged) for this ticket next to the ticket file and the spec sections it cites:
   - Every checkbox in the ticket is done, or you note why not.
   - Every AC, INV and spec section the ticket cites has the code that implements it and a test that fails without it. Name them. A cited item with no test is a finding.
   - Nothing beyond the ticket's scope slipped in. Work that belongs to a later ticket waits for it.
   - User-facing text comes from the spec or `@repo/contracts` constants (design pass item 7).
   - Every `deviate` row of the design notes (step 4) is built and has a test that fails on the spec's sketch.

   Fix each finding and re-run step 7. Done when the review finds nothing new.

9. **Commit** one Conventional Commit per ticket; the body names every `deviate` row. Rewrite the spec's sketch for each deviation as the invariant it missed, so later tickets and features build on the sound version.
10. **After the tracer-bullet ticket**, run `/code-review` on the branch and fix its findings before starting the next ticket: later tickets copy whatever the tracer establishes.

## After the last ticket: feature review

Review the whole feature (`git diff develop...HEAD`) with the full spec set (`1-…` to `5-…`) and `tickets/README.md` open, not ticket by ticket. Run `/code-review` and `/security-review` on the branch, then check each area below yourself. Tickets built in separate contexts duplicate each other: look for two implementations of the same idea.

1. **Spec complete.** Every AC and INV in `1-requirement-spec.md` has code and a test. Every ticket in `tickets/README.md` is done and has its `.design.md`. Every `deviate` row is written back into the spec.
2. **SOLID.**
   - S: controllers parse input and call one service method; each service and repository has one job; no god-service.
   - O: a new role, permission or option is added through data (`role_permissions`, `@repo/contracts` constants), not by editing branches in existing code.
   - L: fakes and TypeORM implementations honour the same abstract contract, including errors and ordering.
   - I: abstract repositories and event classes expose only what their callers use.
   - D: services depend on abstract classes bound by custom providers, never on TypeORM or another concrete class.
3. **Security, OWASP Top 10** (CLAUDE.md §5):
   - A01 Broken access control: every route has its guard (`@WorkspaceRead`/`@WorkspaceWrite`, `@ProjectRead()`/`@ProjectWrite()`), and resource ownership is checked. Permissions come from `role_permissions` through `@repo/contracts` helpers, with no role-name comparison.
   - A02 Cryptographic failures: no secret, token or password in code, logs or responses; cookies keep their flags.
   - A03 Injection: DTOs validated with whitelisting; no hand-written SQL in app code; no column names in repositories.
   - A04 Insecure design: rate limits on writes and on lookups that reveal private resources; multi-write operations in one transaction; concurrent identical writes answer 4xx.
   - A05 Security misconfiguration: Origin/CORS, Helmet, no-store on private responses; no stack, SQL or `err.message` in responses.
   - A06 Vulnerable components: run `pnpm audit` if dependencies changed.
   - A07 Identification and authentication failures: a session on every route outside the public allowlist (`architecture.spec.ts`).
   - A08 Software and data integrity failures: `@AppendOnly()` history tables are not updated; migrations revert cleanly (`migrations.e2e-spec.ts`).
   - A09 Logging and monitoring failures: no PII in logs; log lines an outsider can trigger are bounded.
   - A10 SSRF: no server-side fetch of a user-supplied URL.
4. **Extensibility.** Read the roadmap and the `FC-` constraints in `2-business-analytics-spec.md`. For each one, name the seam that the next feature will extend (guard and decorator, path helper, contracts helper, abstract repository, shared component or hook) and check it needs no rewrite. Every collection has a limit and a real count; every new WHERE, ORDER BY and FK column has an index; there are no N+1 queries and nothing is hardcoded that the roadmap will vary.

Then:

1. Fix each finding in a `review(<scope>)` commit and re-run step 7. After a fix, re-check the area it touched. Defer a finding only with a reason: it belongs to a feature the roadmap names, or it needs the user's decision.
2. Write `.claude/reviews/<branch with "/" as "__">.md` after the final commit, with one section per area above: findings, what was fixed (commit), what was deferred and why. The merge hook refuses a branch whose report is missing or older than its last commit.
3. Re-run step 7, then merge as in CLAUDE.md §8.
