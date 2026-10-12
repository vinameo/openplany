---
name: spec-review
description: Review an OpenPlany feature spec (packages/docs/<n>-<feature>/, part B above all) for design flaws before it is split into tickets. Use when a spec is written or changed, or when asked to review, audit or check a spec.
---

# Spec review

A spec's part B is followed literally by implementing agents, so a flaw written there ships. Reviews of features 9 and 10 traced most code-review findings to part B: a two-query lookup, URL rewriting by string search, an access check only one endpoint could use, a migration that failed on existing data, no limit on 403/404 probing, a `total` counted after the list was cut. This review catches that class of flaw while it is still one line of prose.

**Report only.** Do not edit the spec, `CONTEXT.md` or code. The author decides each fix.

## Steps

1. **Read the whole spec**: every file in the feature directory (`1-requirement-spec.md` … `5-web-spec.md`, `tickets/` if present), then `CLAUDE.md` §5 and §8 and the code each part B names. Facts come from the code and the DB, never from the spec's own description of them. Done when every file path, entity, guard and hook part B cites has been opened.
2. **Inventory** what part B commits to: every endpoint, every list or nested collection in a response, every migration and index, every route and URL, every code sketch, every `FC-` constraint, every piece of shared logic (authorization, visibility, URL shape, page meta, copy). Done when each item has a line in your working list.
3. **Apply every check below to every inventory item it fits.** Write a concrete failure scenario for each finding: input or state → wrong result.
4. **Report** in the format below. Done when every check ID appears either as a finding or under "Checked, no finding".

## Checks

### API

- **A1 Seam for access.** A child resource (`/workspaces/:slug/projects/:identifier/…`) is loaded and authorized by a guard and param decorator (`@ProjectRead()`/`@ProjectWrite()`, `@CurrentProject()`), never inside a service, so the next endpoint cannot forget it.
- **A2 One read per decision.** Existence and permission are decided from one read of one row. Two queries for one decision can disagree (TOCTOU) and cost a round trip.
- **A3 Probing.** If 403 and 404 differ for a private resource, failed lookups are rate-limited per user, error bodies carry no resource data, and log lines per user are bounded.
- **A4 Adversarial inputs.** Each request field has a row: missing, wrong type, array or null instead of object, empty, NUL and control characters, over-long, non-canonical case, ID from another workspace. Each answers 4xx. Nested objects need `@IsDefined`, `@IsObject`, `@ValidateNested`.
- **A5 Bounded responses.** Every list has a maximum; when cut, `total` is the real count (not the length after the cut). Nested collections return a preview plus the real count.
- **A6 One visibility rule.** Who sees which fields (members, emails) is one helper shared by list, detail and create responses.
- **A7 Concurrency.** Uniqueness rests on a DB index; two concurrent identical writes give one success and one 409.

### Database

- **D1 Index scope.** Each unique index is partial (`WHERE deleted_at IS NULL`) or full on purpose. A value that appears in URLs stays reserved after a soft delete.
- **D2 FK indexes.** Every FK column a parent delete searches has a full index; partial indexes do not serve FK lookups.
- **D3 Migration meets data.** Before adding a constraint or unique index, the migration queries for violating rows and stops with a message naming them. `down()` restores the previous schema exactly. The migration is added to the e2e `MIGRATIONS` list.
- **D4 Soft deletes.** Every query, index and count states how it treats soft-deleted rows.

### Web

- **W1 URLs.** URLs are built by the path helpers (`workspacePath`, `workspaceSettingsPath`, `projectPath`). Nothing parses a pathname by string search. Route words colliding with user values (a workspace slug `projects`) are tested.
- **W2 Shared building blocks.** Route meta, sidebar items, page-header CSS and fetch hooks reuse the existing shared pieces (`useRouteHandleMeta`, `SidebarNavItem`, `pageHeader.module.css`). A context that exposes server data also exposes `reload()` and an apply-update function.
- **W3 Copy.** User-facing text comes from the spec or `@repo/contracts` constants, never `err.message`.
- **W4 Real numbers.** Counts on screen use the real count from the API (`memberCount`, `total`), not an array length.
- **W5 Accessibility.** A filtered grid keeps one tab stop. Server field errors without a matching input are shown.

### Spec as a whole

- **S1 Sketches.** Code sketches are marked illustrative and pass the checks above.
- **S2 Future constraints.** Each `FC-` constraint is turned into a seam in this feature, or explicitly deferred with a reason.
- **S3 Acceptance criteria.** ACs cover adversarial inputs, limits and failure paths, not only happy paths.

## Report format

```markdown
## Spec review: <feature directory>

| ID | Check | Severity | Where (file › section/ID) | Finding | Failure scenario | Proposed fix |
| --- | --- | --- | --- | --- | --- | --- |
| SR-1 | A2 | blocker | 4-api-spec.md › B4 | … | … | … |

**Checked, no finding:** A1, A5, …
**Not applicable:** D1 (no new index), …
```

Severity: **blocker** (security or data loss, or a flaw every later ticket will copy), **major** (wrong behaviour in a reachable case), **minor** (clarity, consistency).
