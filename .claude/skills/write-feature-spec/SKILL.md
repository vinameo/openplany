---
name: write-feature-spec
description: Write or update an OpenPlany feature spec set (packages/docs/<n>-<feature>/: requirement, business analysis, database, API, web) from a draft UI or a request, then gate it with spec review and split it into tickets. Use when asked to write requirements, specs, BA/DB/API/web specs, or to turn a draft into tickets.
---

# Write a feature spec

Specs live in `packages/docs/<n>-<feature-slug>/` next to the draft UI images, written in Vietnamese. The directory name is also the branch name (`feature/<n>-<feature-slug>`, CLAUDE.md §8).

## Steps

1. **Settle the decisions with the user.** Run a grilling session (`mattpocock-skills:grill-with-docs`) over the draft, the code and `CONTEXT.md` until no decision is left assumed. Facts come from the code and the DB (via MCP: schema and aggregate counts only, never personal data). Never name the reference product the drafts imitate; describe its ideas as OpenPlany's own. Done when the user confirms shared understanding.
2. **Write the five files** in the format below. Done when every decision from step 1 has a `D` row and every part B section exists.
3. **Gate with spec review.** Dispatch the `spec-reviewer` subagent on the directory. Bring each blocker and major finding to the user with your recommended fix, apply the agreed fixes to every affected file, and keep IDs consistent across files. Each scenario that breaks a sketch (check P8) becomes an invariant or edge case plus a test row. Done when no blocker or major finding is open.
4. **Split into tickets** with `mattpocock-skills:to-tickets`, writing `tickets/README.md` plus one `NN-slug.md` per ticket, using the ticket rules below. That skill sets `disable-model-invocation`, so the Skill tool cannot load it: read its `SKILL.md` (`~/.claude/plugins/cache/*/mattpocock-skills/*/skills/engineering/to-tickets/SKILL.md`, newest version) and follow it in place, including its step that shows the proposed breakdown to the user and waits for approval before writing files. This skill overrides two of its defaults: tickets go in the spec directory's `tickets/`, not `.scratch/`, and they may cite spec IDs and section numbers. Done when the user has approved the breakdown and every ticket file exists.

## File set

| File | Answers |
| --- | --- |
| `1-requirement-spec.md` (RQ) | **What** to build |
| `2-business-analytics-spec.md` (BA) | **Why**: evidence, options and trade-offs (ADRs), priorities, metrics, future constraints |
| `3-database-spec.md` (DB), `4-api-spec.md` (API), `5-web-spec.md` (WEB) | RQ part B refined for one layer; the layer file wins on its own detail |

RQ and BA do not repeat each other.

Every file has two parts:

- **PHẦN A, for people** (product owner, designer, QA, new dev), readable in about 5 minutes: the story (why the feature exists, the problem, what it does, who uses it, where it opens, inputs, outcome, what it does not do), usage steps, screens and deviations from the draft, key rules in plain words, out of scope, success criteria, decisions, open questions each with a default.
- **PHẦN B, for implementing agents**: reading rules (section B0 below, verbatim), current code state (with the commit it was checked at) with verified file paths, scope, invariants, file-by-file changes, contracts, algorithm steps, error table, tests mapped to ACs, Given/When/Then ACs, implementation order, Definition of Done, technical risks.

**ID scheme**, shared across files and kept consistent when a later file changes an earlier one: `D` decisions, `Q-<x>` open questions, `S-` scope, `INV-` invariants, `AC-` acceptance criteria, `R-` technical risks, `BR` business risks, `E-`/`F` evidence and findings, `ADR-` decisions (with implementation constraints), `M-` metrics (with SQL and thresholds), `FC-` future constraints, `DB-`/`API-`/`WEB-` layer requirements.

## Part B must carry

Implementing agents treat every sketch as a *hypothesis* and build to the invariants (`implement-ticket` step 4). Part B therefore states each requirement in a form a sketch can be tested against:

- **B0, verbatim** (the reading rules):

  > - **PHẢI** / **KHÔNG ĐƯỢC**: bắt buộc. **NÊN**: làm trừ khi có lý do ghi trong commit. **CÓ THỂ**: tuỳ chọn. `CLAUDE.md` áp dụng toàn bộ.
  > - Yêu cầu là AC, INV, quyền và câu chữ. Code mẫu, query và thứ tự bước là **giả thuyết**: agent kiểm chúng với code và dữ liệu thật ở HEAD (`implement-ticket` bước 4).
  > - Giả thuyết sai mà bản đúng vẫn giữ mọi AC, quyền và câu chữ → làm bản đúng, ghi vào commit và sửa spec. Bản đúng đổi điều người dùng thấy → dừng lại và hỏi.

- **Decisions as invariants.** For every decision a write depends on (who may act, which role, which rows, what count), state:
  - what is decided, from which data;
  - where and when that data is read: a row locked in the same transaction, or a value the guard read earlier;
  - the edge cases: soft-deleted rows, deactivated accounts, ended memberships, the same write twice, a change committed between the read and the write, who is in or out of a count;
  - one test row per edge case.

  Each rule lives in one section; other sections and files point to it.
- **Sketches as shapes.** Code shows signatures, types and call shapes (`create({ …, creatorRoleFor })`), labelled *minh hoạ* and tied to the `INV-` it serves. Lock modes, `where` clauses, queries, counts and the order of checks are written as invariants and steps in words.
- **Seams.** For every rule more than one endpoint or page will need, name the reusable seam (guard and decorator, path helper, shared hook or component, context API). Map every `FC-` constraint to a seam in this feature or defer it with a reason.
- **Adversarial input table** per endpoint, with the expected 4xx for each row.
- **Bounds**: list maximums, real counts beside previews, rate limits on lookups whose 403/404 reveal existence, one log line per person and window for warnings any member can trigger.
- **Migrations**: the pre-check of existing rows, the exact `down()`, and the soft-delete scope of every index.
- **Copy and codes** for every user-facing message, including errors, in both English (`en`) and Vietnamese (`vi`), following the glossary in `CONTEXT.md` (BA FC-4). Each sentence the web must tell apart has its own `code` in the API error table.

## Ticket rules

- Checkboxes name the outcome and the `INV-`/`AC-` that proves it. A function name or step order copied from part B is a hypothesis, like the sketch it comes from.
- Ticket 01 is the prefactor: extract the shared seams the feature needs, with no change users can see; done when existing tests stay green unchanged.
- The tracer bullet comes early, and its acceptance list ends with "run `/code-review` on the branch and fix findings before later tickets build on it".
- The last ticket is acceptance: every AC mapped to a test, BA metrics measured, and the whole-branch self-review written to `.claude/reviews/<branch>.md` (the merge hook requires it).
