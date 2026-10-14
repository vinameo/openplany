<!--
  CLAUDE.md | AGENTS.md — project instructions for Claude Code (and a quick reference for humans).
  Claude loads this file automatically at the start of every session in this repo.
  Keep it accurate: when tooling, scripts, or conventions change, update this file in the same PR.
  Items marked (planned) describe target conventions that are not wired up yet.
-->

# OpenPlany

Open-source project management tool for tracking issues. This is a **pnpm + Turborepo monorepo** with a NestJS API, a React/Vite web app, and shared packages.

## 1. Project Overview

### Tech stack

| Area            | Choice                                                         | Installed version |
| --------------- | -------------------------------------------------------------- | ----------------- |
| Runtime         | Node.js LTS (`.nvmrc`)                                         | 24                |
| Package manager | pnpm workspaces (`nodeLinker: hoisted`)                        | 12.6.0            |
| Build/orchestration | Turborepo                                                  | 2.x               |
| Language        | TypeScript (strict)                                            | 6.x (apps), 5.x (`@repo/ui`) |
| Backend         | NestJS + Express, class-validator/class-transformer            | 12.x              |
| Database        | PostgreSQL + TypeORM (`@nestjs/typeorm`, `pg`)                 | 17 / 1.x          |
| Cache           | Redis (container only — no Nest client yet)                    | 8                 |
| Config          | `@nestjs/config` (dotenv) + class-validator env validation     | —                 |
| Frontend        | React + Vite + Mantine UI + react-router                       | 19 / 8 / 9 / 8    |
| Server state    | TanStack Query (`@tanstack/react-query`)                       | 5                 |
| Auth            | Opaque session cookie, argon2id via `node:crypto` (Node 24+), `helmet`, `cookie-parser` | — |
| Testing         | Vitest (API: unit + e2e with Supertest; web/ui: jsdom + React Testing Library) | 4.x (api), 5.x (web/ui) |
| Linting         | oxlint (API with `--type-aware`, ui), ESLint flat config (web) | —                 |

### Workspace layout

```
OpenPlany/
├── apps/
│   ├── api/          # @repo/api — NestJS backend, port 3000, global prefix /api
│   └── web/          # @repo/web — Vite + React frontend, port 5173 (proxies /api → :3000)
├── packages/
│   ├── ui/           # @repo/ui — shared Mantine components, theme, AppUiProvider
│   └── contracts/    # @repo/contracts — Zod schemas + shared API types (planned, not created yet)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json      # root scripts delegate to turbo
```

### Why pnpm

- Strict, content-addressed store: fast installs, little disk usage.
- First-class workspaces and the `workspace:*` protocol for internal packages.
- Pinned via `packageManager` in `package.json` — Corepack/devEngines downloads the right version automatically.

## 2. Universal Rules

> ⚠️ These apply to every change, in every workspace.

- **ALWAYS use `pnpm`.** Never use `npm`, `npx`, or `yarn`. Use `pnpm exec` / `pnpm dlx` instead of `npx`.
- **Internal deps use `workspace:*`.** Example: `"@repo/ui": "workspace:*"`. Never point to a version range or relative path.
- **Apps never import from other apps.** `apps/web` must not import from `apps/api` and vice versa.
- **Shared code lives only in `packages/`.** If two apps need it, move it into a package.
- **Packages never import from `apps/`.**
- **Strict TypeScript, no `any`.** Use `unknown` + narrowing, generics, or Zod-inferred types. No `@ts-ignore`; use `@ts-expect-error` with a reason only as a last resort.
- **Never swallow errors.** Every `catch` must rethrow, map to a typed/HTTP error, or log with context. No empty `catch {}`; no floating promises.
- **Never hardcode secrets.** Read config from environment variables.
- **Don't add a new major dependency without asking first.**

## 3. Commands Reference

### Root (runs across all workspaces through Turborepo)

```bash
pnpm install          # install all workspace deps
pnpm dev              # turbo dev — api (:3000) + web (:5173)
pnpm build            # turbo build (respects ^build dependency order)
pnpm test             # turbo test
pnpm lint             # turbo lint
pnpm typecheck        # turbo typecheck
pnpm format           # prettier --write .
pnpm dup              # jscpd: fails above the duplicated-code threshold in .jscpd.json
pnpm clean            # turbo clean + remove node_modules
```

### Single workspace (`pnpm --filter`)

```bash
pnpm --filter @repo/api dev           # nest start --watch
pnpm --filter @repo/api test          # vitest unit tests + coverage
pnpm --filter @repo/api test:watch
pnpm --filter @repo/api test:e2e      # vitest with vitest.config.e2e.ts
pnpm --filter @repo/web dev           # vite
pnpm --filter @repo/web build         # tsc -b && vite build
pnpm --filter @repo/api typecheck     # tsc --noEmit
pnpm --filter @repo/web typecheck
pnpm --filter @repo/web test          # vitest + RTL (jsdom)
pnpm --filter @repo/ui test
pnpm --filter @repo/ui typecheck
```

### Turborepo with filters

```bash
pnpm turbo build --filter=@repo/web             # web + its dependencies
pnpm turbo test --filter=@repo/api
pnpm turbo typecheck --filter=...@repo/ui       # ui and everything that depends on it
pnpm turbo build --filter=[HEAD^1]              # only workspaces changed since last commit
```

### Adding dependencies

```bash
pnpm --filter @repo/web add dayjs               # runtime dep to one workspace
pnpm --filter @repo/api add -D @types/foo       # dev dep
pnpm --filter @repo/web add @repo/ui@workspace:* # internal package
pnpm add -Dw prettier                           # root-level tooling only
```

### Docker

```bash
docker compose up -d postgres redis              # backing services for `pnpm dev`
docker compose up -d --build                     # full stack incl. API (runs migrations on boot)
docker build -f apps/api/Dockerfile -t openplany-api .   # always from the repo root
```

No web Dockerfile yet.

### Database migrations (TypeORM)

The CLI runs against compiled JS (`dist/database/dataSource.js`), so each script builds first.

```bash
pnpm --filter @repo/api migration:generate src/database/migrations/AddIssues  # diff entities → migration
pnpm --filter @repo/api migration:create src/database/migrations/SeedFoo      # empty migration
pnpm --filter @repo/api migration:run
pnpm --filter @repo/api migration:revert
pnpm --filter @repo/api user:create an@openplany.dev "An Nguyen" [--instance-admin]  # dev / admin user; password read from stdin
pnpm --filter @repo/api user:promote an@openplany.dev  # elevate existing user to instance admin
```

## 4. Code Style & Conventions

### Naming

- **Files:** camelCase — `issueService.ts`, `useIssues.ts`.
  - NestJS files keep their role suffix: `issue.controller.ts`, `issue.service.ts`, `createIssue.dto.ts`, `issue.module.ts`.
  - React component files: PascalCase matching the component — `IssueCard.tsx`, `AppButton.tsx`.
- **Classes, components, types, interfaces:** PascalCase. **Variables, functions, hooks:** camelCase (`useIssueFilters`). **Constants:** `UPPER_SNAKE_CASE`.
- Tests sit next to the code: `issue.service.spec.ts`, `IssueCard.test.tsx`. API e2e tests go in `apps/api/test/*.e2e-spec.ts`.

### Imports

- **Across packages:** import by package name — `import { AppButton } from '@repo/ui'`. Never reach into another package's `src/`.
- **Within a package:** relative imports.
- **API is native ESM (`module: nodenext`):** relative imports **must** end in `.js` — `import { AppService } from './app.service.js'`.
- **Web uses `verbatimModuleSyntax`:** use `import type { … }` for type-only imports.

### Exports

- Prefer **named exports**. Avoid `export default` (Vite config files are the exception).
- Each package exposes its public API through `src/index.ts` and `package.json#exports`.

### Frontend

- Functional components + hooks only. No class components.
- Use Mantine components and theme tokens from `@repo/ui`; avoid ad-hoc inline styles. Use CSS Modules (`*.module.css`) for custom styling.
- Web enables `erasableSyntaxOnly`: no `enum`, no `namespace`, no constructor parameter properties. Use `as const` objects or union types.

### Backend

- Constructor injection only: `constructor(private readonly issueService: IssueService) {}`.
- Depend on interfaces/abstract classes for anything swappable (repositories, external clients); bind them with custom providers.
- **DTOs are classes validated with `class-validator`.** A global `ValidationPipe` runs with `whitelist`, `forbidNonWhitelisted`, and `transform` — undeclared fields are rejected.

```ts
export class CreateIssueDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsEnum(IssuePriority)
  priority?: IssuePriority;
}
```

## 5. Architecture Guidelines

### Backend (NestJS)

- **Modular:** one feature module per domain (`issues/`, `projects/`, `users/`) containing its controller, service, DTOs, and repository.
- **Thin controllers, thick services:** controllers parse input, call one service method, and return the result. Business rules live in services.
- **DTOs at the boundary:** validate every incoming payload; never return raw ORM entities — map to response DTOs.
- **SOLID:** small single-purpose services, depend on abstractions, avoid god-services.
- **Errors:** throw Nest `HttpException` subclasses (`NotFoundException`, `ConflictException`, …) or domain errors mapped by an exception filter. Never leak stack traces or SQL errors to clients.
- **OWASP Top 10 checklist:**
  - Authorize every endpoint (guards); check resource ownership, not just authentication.
  - Validate and whitelist all input; use parameterized queries only.
  - Keep CORS restricted: origins come from `CORS_ORIGIN`; the global `OriginGuard` rejects state-changing requests from any other `Origin`.
  - Rate-limit auth and write endpoints, and lookups whose 403/404 reveal whether a private resource exists; add security headers (Helmet).
  - Never log secrets, tokens, or personal data.
  - Keep dependencies patched (`pnpm audit`).
- **Permissions:** quyền của vai trò đọc từ DB (`role_permissions`) rồi đưa vào hàm của `@repo/contracts`; không so sánh trực tiếp tên vai trò trong backend/frontend, không đọc bộ mặc định ở code chạy thật; dùng quyền đã thực thi và hàm trợ giúp từ contracts.

### Frontend (React)

- **Composition over configuration:** small components composed together; lift shared state only as far as needed.
- **Custom hooks** for reusable logic (`useIssueFilters`, `useDebouncedSearch`); keep components mostly presentational.
- **Server state vs client state:** server data (fetched from the API) lives in TanStack Query. `ServerStateProvider` (root of `appRoutes`) gives each signed-in user their own cache. Query keys live next to the feature's API client (`features/projects/api/projectQueries.ts`); a write updates the cache (`setQueryData`) instead of refetching. UI-only state uses `useState`/`useReducer`/context. Don't copy server data into local state. Older hand-rolled fetch hooks (workspaces, members) still exist; move them over when you touch them.
- Call the API via relative `/api/...` URLs — the Vite dev server proxies them to `:3000`.

### Shared packages

- Export only the public API from `src/index.ts`. Internal helpers stay unexported.
- `@repo/ui` is consumed as source (`exports` → `./src/index.ts`); it has no build step. Mantine and React are **peer** dependencies — don't move them to `dependencies`.
- `@repo/contracts` (planned): Zod schemas are the single source of truth for API shapes; export inferred types (`z.infer<typeof IssueSchema>`) for the web app and use the same schemas or mirror them in API DTOs.

### Database (planned)

- PostgreSQL + TypeORM. `src/database/dataSourceOptions.ts` is shared by `DatabaseModule` (Nest) and `dataSource.ts` (CLI).
- Entities: `*.entity.ts` in their feature module, registered with `TypeOrmModule.forFeature()` (`autoLoadEntities` is on).
- Config is validated at startup by `src/config/env.validation.ts` — add new env vars there and to `.env.example`.
- **Repository pattern:** services talk to repositories, never to the ORM client directly from controllers.
- **No hand-written SQL in app code — use TypeORM through entities.** A column rename must only touch the entity's `@Column({ name })` and a migration, never repositories. Preference order:
  1. `find`/`findOne`/`insert`/`update`/`delete`/`increment` with `FindOptionsWhere` objects and operators (`In`, `IsNull`, `Not`, `Or`, `LessThan`, …); locks via `lock: { mode: 'pessimistic_read' | 'pessimistic_write' }`.
  2. QueryBuilder on entity classes (`createQueryBuilder(WorkspaceMember, 'm')`) referring to **entity property paths** (`'m.memberId'`, `'u.isActive'`), never database column names (`member_id`, `is_active`). Prefer object `.where({ ... })` over strings.
  3. Reusable helpers in `src/database/` when TypeORM lacks an API: `equalsLowercase()` (`lower(col) = value` via `Raw`), `acquireTransactionLock()` (advisory lock). Add a helper there rather than inlining SQL.
  - ❌ `dataSource.query()` / `manager.query()` / `queryRunner.query()` with table or column names, `insert().into('table_name')`, `.returning('column_name')`, `.set({ x: () => 'column_name + 1' })`. Exceptions: migrations, and e2e tests that inspect the catalog or bypass the app on purpose.
  - Every table the app reads or writes has an entity. Append-only tables (history/audit) carry `@AppendOnly()` (`src/database/appendOnly.ts`); its subscriber rejects update/delete through TypeORM.
  - Shared filters ("who is addable", "active user") live in one `FindOptionsWhere` constant reused by every query, not copied between queries.
- **Migrations only:** every schema change ships as a migration. Never use `synchronize: true` / `db push` outside throwaway local DBs.
- **Transactions:** wrap multi-write operations in a transaction; keep transactions short and free of external HTTP calls.

## 6. Testing Strategy

| Layer        | Tool                                  | What to test                                        |
| ------------ | ------------------------------------- | --------------------------------------------------- |
| API unit     | Vitest + `@nestjs/testing`            | Services: business rules, edge cases, error paths. Mock repositories. |
| API e2e      | Vitest + Supertest (`test:e2e`)       | Controllers end-to-end: status codes, validation, auth. |
| Web/UI component | Vitest + React Testing Library (jsdom) | Render + user interactions; query by role/label, not test IDs. |
| Web integration | Vitest + RTL                         | Hooks + components together with a mocked API.      |

- Web/UI tests match `src/**/*.test.{ts,tsx}`; the setup file `src/test/setup.ts` loads jest-dom matchers and stubs `matchMedia`/`ResizeObserver` for Mantine.
- Wrap rendered components in `<AppUiProvider>` — Mantine components throw without a `MantineProvider`.
- Import test APIs explicitly (`import { describe, it, expect, vi } from 'vitest'`) in web/ui; API tests use Vitest globals.

- **Coverage target (guideline, not enforced yet):** ≥ 80% lines on API services; critical paths (auth, permissions) close to 100%.
- **Naming:** `describe('IssueService')` → `describe('create')` → `it('throws ConflictException when title already exists')`. Describe behavior, not implementation.
- Each test is independent: no shared mutable state, no reliance on order.
- ⚠️ E2E tests build the app via `Test.createTestingModule`, so `main.ts` setup (global `/api` prefix, `ValidationPipe`, CORS) is **not** applied unless you apply it in the test too.
- ⚠️ `AppModule` connects to PostgreSQL, so e2e tests need `docker compose up -d postgres` and `apps/api/.env`. They run against `<db>_test` (created and migrated by `test/e2eGlobalSetup.ts`) and truncate it between tests — never the dev database. Build the app with `createE2eApp()`, which applies `configureApp()` like `main.ts`.
- ⚠️ API tests need **Node 24** (`crypto.argon2`); on Node 22 the password hasher fails.
- **Guard suites** turn review lessons into red tests; extend them rather than bypass them:
  - `apps/api/src/architecture.spec.ts` reads Nest route metadata: sessions everywhere outside a public allowlist, `WorkspaceMemberGuard` under `/workspaces/:slug`, `ProjectAccessGuard` under `/projects/:identifier`.
  - `apps/api/test/adversarialInputs.e2e-spec.ts` sends malformed bodies (from `adversarialBodies()`) to every JSON write endpoint and fails on any 5xx; add a case for each new write endpoint.
  - `apps/api/test/migrations.e2e-spec.ts` reverts the newest migrations over realistic rows and compares each `down()` with a fresh database; register each new migration in `MIGRATIONS` (`test/e2eGlobalSetup.ts`).
  - Web ESLint rejects app URLs built as `` `/${…}` `` outside the path helpers.

## 7. Common Pitfalls

> ❌ Avoid all of these.

- ❌ Running `npm install` / `npx …` — it creates a stray `package-lock.json` and breaks the workspace. Use `pnpm`.
- ❌ Writing `"@repo/ui": "^0.0.0"` or `"file:../../packages/ui"` instead of `workspace:*`.
- ❌ Importing from `apps/*` inside `packages/*`, or from one app into another.
- ❌ Putting business logic, DB queries, or authorization decisions in controllers.
- ❌ Forgetting the `.js` extension on relative imports in `apps/api` — it compiles but fails at runtime.
- ❌ Raw SQL or database column names in repositories (`manager.query('SELECT … FROM users')`, `'user.is_active = true'`) — use entities and property paths (§5 Database).
- ❌ Using `any` to silence the compiler.
- ❌ Empty `catch` blocks or un-awaited promises.
- ❌ Hardcoding credentials, API keys, or connection strings.
- ❌ Committing `.env` / `.env.*` files (only `.env.example` is allowed — see `.gitignore`).
- ❌ Adding Mantine/React as a regular dependency of `@repo/ui` (causes duplicate React/Mantine instances).

## 8. Development Workflow

### Branch naming

```
feature/<short-description>      # feature/1-issue-labels
fix/<short-description>       # fix/2-login-redirect
review/<short-description>       # review/3-issue-labels
chore/ | refactor/ | docs/ | test/
```

### Branch workflow for agents (one branch per feature spec)

`<short-description>` is the feature's directory name under `packages/docs/` — e.g. coding `packages/docs/1-login-page/` happens on `feature/1-login-page`.

1. **Before writing any code**, run `git fetch` (if a remote exists) and check whether `feature/<docs-dir>` exists locally or on the remote (`git branch -a --list '*feature/<docs-dir>'`).
   - Exists → `git switch feature/<docs-dir>` and continue there.
   - Missing → branch from an up-to-date `develop`: `git switch develop && git pull --ff-only` (when a remote exists), then `git switch -c feature/<docs-dir>`.
   - Uncommitted changes in the working tree → stop and ask the user before switching.
2. Commit on the feature branch in small Conventional Commits (one per ticket where possible).
3. **When the work is done**, the self-review below is clean, and `pnpm lint && pnpm typecheck && pnpm test` (plus `test:e2e` for API changes) pass: `git switch develop && git merge --no-ff feature/<docs-dir>` so the feature shows up as one merge commit to review. Keep the feature branch (don't delete it).
4. On merge conflicts, or if any check fails, stop and report — never force, rebase shared history, or merge with failing checks.
5. Never push, and never touch `main`, unless the user asks.

### Design pass and self-review (lessons from the reviews of features 7, 9, 10 and 13–16)

Each of those features passed every ticket's acceptance criteria and its checks, then needed a review-fix branch. Green tests prove the spec's happy paths; they do not prove the design. Run the design pass before coding each ticket and the self-review before step 3.

**Every sketch in a spec is a hypothesis.** Part B's code, queries, algorithms and file lists were written without running code, and copying them shipped flaws: a two-query lookup, URL parsing by string search, an access check only one endpoint could use (features 7–10); a decision taken from the guard's stale role, a lock that missed soft-deleted rows, a count compared to 1, one rule written in two sections, two messages under one error code (13–16). The requirement is the ACs, INVs, permissions and copy. Test every sketch against the code and data at HEAD in the ticket's design notes (`implement-ticket` step 4; the `requireTicketDesignNotes` hook refuses a ticket commit without them), build the sound version, and record the deviation in the commit message and in the spec.

**Design pass** (per ticket, before writing code):

1. **One decision, one seam.** A rule that a second endpoint or page will need (authorization, visibility, URL shape, page meta, shared copy) gets a reusable seam the first time it is written, sized for the features the spec's roadmap and `FC-` constraints already name:
   - API: a child resource is loaded and authorized by a guard and a param decorator (`@ProjectRead()`/`@ProjectWrite()` with `@CurrentProject()`), never inside a service.
   - Web: build URLs with the path helpers (`workspacePath`, `workspaceSettingsPath`, `projectPath`) and read route meta with `useRouteHandleMeta`.
   - Context: one that exposes server data also exposes `reload()` and an apply-update function.
2. **Read once, decide on that row.** Decide existence and permission from one read. Two queries for one decision can disagree (TOCTOU) and cost an extra round trip.
3. **Bounded.** Give every collection in a response a limit (and the real count alongside it). Bound every response that leaks information (rate-limit 403/404 probing) and every log line an outsider can trigger.
4. **Adversarial inputs.** For each endpoint, list and test: missing field, wrong type, array or `null` instead of object, empty string, control characters and NUL, over-long values, non-canonical case, an ID from another workspace, two concurrent identical writes. Each one answers 4xx, never 500. On the web, test path segments that collide with route words (e.g. a workspace slug `projects`).
5. **Migrations meet real data.** Before adding a unique index or constraint, query for the rows that would violate it and stop with a message naming them. Partial indexes do not serve FK lookups: every FK column gets a full index.
6. **Extract before you copy.** When new code would repeat a block (about 10 lines of logic, a JSX block, a CSS rule set) from existing code, extract it into a shared component, hook or helper in a prefactor commit, then use it in both places. Carry over only what the new code reads: no dead refs or state.
7. **Copy from the spec.** User-facing text comes from the spec or `@repo/contracts` constants, never from `err.message`.

**Self-review** (before step 3; done when every finding is fixed or recorded with a reason in the report):

- Before each ticket's commit, review its diff against the ticket and the spec sections it cites (`implement-ticket` step 8).
- After the last ticket, review `git diff develop...HEAD` as a whole branch, not ticket by ticket: spec completeness, SOLID, the OWASP Top 10 (§5), extensibility against the spec's roadmap and `FC-` constraints, the design pass and §7. The checklist is "After the last ticket: feature review" in `implement-ticket`. Tickets built in separate contexts duplicate each other: look specifically for two implementations of the same idea across tickets. Fix the findings before merging.
- Prefer running `/code-review` on the branch. Otherwise, review it yourself against the same lists. Also run it right after the tracer-bullet ticket: later tickets copy whatever the tracer establishes.
- Write the report to `.claude/reviews/<branch with "/" as "__">.md` (untracked) after the last commit. A PreToolUse hook (`.claude/hooks/requireBranchReview.mjs`) refuses `git merge` of a `feature/`, `fix/`, `refactor/`, `chore/` or `review/` branch whose report is missing or older than its tip.

### Spec review: OpenPlany checks

The `spec-review` skill (user-level, shared across projects) reads this section. Specs live in `packages/docs/<n>-<feature>/`, written in Vietnamese. The five components map to `1-requirement-spec.md` (R), `2-business-analytics-spec.md` (B), `3-database-spec.md` (D), `4-api-spec.md` (A) and `5-web-spec.md` (W). Part B of each file is what agents implement. Add these checks to the skill's list:

- **P1 Access seams.** Routes under `/workspaces/:slug` use `WorkspaceMemberGuard` (`@WorkspaceRead`/`@WorkspaceWrite`). Routes under `/projects/:identifier` use `@ProjectRead()`/`@ProjectWrite()` with `@CurrentProject()`. Project access is decided only in `ProjectAccessResolver`. `apps/api/src/architecture.spec.ts` enforces this.
- **P2 Permissions.** Permissions follow §5 "Permissions": read from `role_permissions` through `@repo/contracts` helpers, with no role-name comparisons.
- **P3 Data access.** Data access follows §5 "Database": no hand-written SQL in app code; hand-written migrations, each added to `MIGRATIONS` in `apps/api/test/e2eGlobalSetup.ts`.
- **P4 Adversarial inputs.** Each new JSON write endpoint gets a case in `apps/api/test/adversarialInputs.e2e-spec.ts`.
- **P5 Web building blocks.** URLs come from `workspacePath`/`workspaceSettingsPath`/`projectPath`. Route meta uses `useRouteHandleMeta`. Sidebars use `SidebarNavItem`. Page headers use `pageHeader.module.css`. Server state uses TanStack Query, with keys in the feature's `api/*Queries.ts`.
- **P6 Shared copy.** Validation and error messages are `@repo/contracts` constants, used by both the API DTO and the web form.
- **P7 Glossary.** Terms follow `/CONTEXT.md`. The product the drafts imitate is never named.
- **P8 Hypotheses.** Try to break every sketch and algorithm in part B: name a concrete scenario where it answers wrong (a change committed between the read and the write, a soft-deleted row, a deactivated account, an ended membership, the same write twice, someone wrongly in or out of a count). Each scenario is a finding whose fix is an invariant or edge case plus a test row. A sketch with no linked `INV-`, or a lock, query or `where` clause written as code, is a finding.
- **P9 Decide on locked rows.** A value a write depends on (a role, a membership, a count) is read inside the write's transaction from a locked row, never taken from what the guard read.
- **P10 Live rows.** Every read and lock on a soft-deletable table says how deleted rows are excluded or answered.
- **P11 One rule, one section.** A rule (a check order, a count, a filter) is stated once; other sections and files point to it.
- **P12 One code per message.** Each sentence the web shows for an error has its own `code` in the API error table, and the web error table maps codes, never messages.

**Feature workflow skills** (`.claude/skills/`): `write-feature-spec` (grill → five spec files → `spec-reviewer` subagent, which runs the user-level `spec-review` skill with the checks above → tickets), `implement-ticket` (one ticket, and the final self-review and merge) and `implement-feature` (`/implement-feature <docs path>`: every ticket in order through the `deep-coder` subagent, then the branch review and merge).

**Other coding agents (Codex, Antigravity).** `AGENTS.md` is a symlink to this file, and `.agents/skills` and `.agents/agents` are symlinks to `.claude/skills` and `.claude/agents`, so every agent reads the same rules, skills and subagents. In an agent's frontmatter, restrict tools with `disallowedTools`, never `tools:`: Antigravity drops an agent whose `tools:` names Claude Code tools (`agy agents` must list every file in `.claude/agents`). Antigravity gets the hooks from `.agents/hooks.json`, which runs the same `.claude/hooks/requireBranchReview.mjs` (merge gate) and `requireTicketDesignNotes.mjs` (ticket commit gate). When a skill names a Claude Code feature your agent lacks:
- A subagent (`deep-coder`, `spec-reviewer`) your agent cannot start (Codex): read `.claude/agents/<name>.md` and do its job yourself, one ticket at a time, with its preloaded skills as background where you have them.
- `/code-review` or `/security-review`: review `git diff develop...HEAD` yourself with the feature-review checklist in `implement-ticket`.
- `$ARGUMENTS`: the path or number the user gave with the request.
- Codex has no hooks: write the ticket's design notes before each ticket commit and the review report before `git merge` anyway.

Work that isn't tied to one `packages/docs/<n>-…` directory (cross-cutting fixes, review follow-ups) uses `fix/` / `refactor/` / `chore/` with a short description and the same flow.

### Commit messages — Conventional Commits

```
<type>(<scope>): <summary in imperative mood>

feat(api): add issue assignment endpoint
fix(web): keep filters when navigating back
chore(ui): bump mantine to 9.7
```

Types: `feature`, `review`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`. Scopes: `api`, `web`, `ui`, `contracts`, `repo`.

### Before every commit

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All three must pass. Run `pnpm format` if Prettier reports changes.

### PR review checklist

- [ ] Small, focused change with a clear description and linked issue
- [ ] Lint, typecheck, and tests pass; new logic has tests
- [ ] No `any`, no swallowed errors, no secrets, no `console.log` debugging left behind
- [ ] Workspace boundaries respected (no app↔app or package→app imports)
- [ ] New env vars added to `.env.example`
- [ ] DB changes include a migration
- [ ] This file updated if conventions, scripts, or tooling changed

## 9. Environment Setup

```bash
nvm use                     # Node 24 from .nvmrc
corepack enable             # lets packageManager pin pnpm@12.6.0
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d postgres redis
pnpm dev
```

- API: http://localhost:3000/api — Web: http://localhost:5173

### Environment variables (`apps/api/.env.example`)

```dotenv
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://openplany:openplany@localhost:5432/openplany
JWT_SECRET=change-me
LOG_LEVEL=debug
```

`REDIS_URL=redis://localhost:6379`, `DB_LOGGING`, `DB_MIGRATIONS_RUN` are also supported, plus auth settings: `AUTH_HMAC_SECRET` (≥ 32 chars, keys `login_attempts.email_hash`), `SESSION_COOKIE_SECURE`, `SESSION_TTL_DAYS`, `SESSION_ABSOLUTE_TTL_DAYS`, `TRUST_PROXY`. A root `.env.example` holds optional docker-compose overrides.

Web variables must be prefixed `VITE_` to reach client code — and are public, so never put secrets in them.

### Database

Run PostgreSQL + Redis via `docker compose up -d postgres redis`, then `pnpm --filter @repo/api migration:run`.

To bootstrap the first instance admin on a fresh install:
```bash
pnpm --filter @repo/api user:create admin@openplany.dev "Admin" --instance-admin
```

To promote an existing user to instance admin:
```bash
pnpm --filter @repo/api user:promote admin@openplany.dev
```
Or with SQL:
```sql
UPDATE users SET is_superuser = true, updated_at = now() WHERE lower(email) = lower('admin@openplany.dev') RETURNING id, is_superuser;
```

## 10. Deployment

- **Docker:** one multi-stage image per app (`apps/api/Dockerfile` exists), built from the repo root so the workspace is available. Use `turbo prune @repo/api --docker` to produce a minimal build context.
- **API runtime:** `pnpm --filter @repo/api build` then `node dist/main.js` (`start:prod`).
- **Web:** `pnpm --filter @repo/web build` outputs static files to `apps/web/dist` — serve from a CDN/static host and route `/api` to the API.
- **Environment-specific config:** all config comes from env vars; never branch on hostnames. Use `.env` locally and the platform's secret store in staging/production. CORS origin must come from env before deploying.
- **Health check:** `GET /api/health` → `{ status: 'ok', service: 'api', timestamp }`. Use it for container/load-balancer probes.
- **Logging & monitoring:** use Nest's `Logger` (no `console.log`), structured JSON logs in production, include a request ID; never log secrets or PII. Add error tracking/metrics before the first production release.
