<!--
  CLAUDE.md — project instructions for Claude Code (and a quick reference for humans).
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
pnpm --filter @repo/api user:create an@openplany.dev "An Nguyen"  # dev user; password read from stdin
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
  - Rate-limit auth and write endpoints; add security headers (Helmet).
  - Never log secrets, tokens, or personal data.
  - Keep dependencies patched (`pnpm audit`).

### Frontend (React)

- **Composition over configuration:** small components composed together; lift shared state only as far as needed.
- **Custom hooks** for reusable logic (`useIssueFilters`, `useDebouncedSearch`); keep components mostly presentational.
- **Server state vs client state:** server data (fetched from the API) belongs in a data-fetching cache layer (e.g. TanStack Query — not installed yet, ask first); UI-only state uses `useState`/`useReducer`/context. Don't copy server data into local state.
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

## 7. Common Pitfalls

> ❌ Avoid all of these.

- ❌ Running `npm install` / `npx …` — it creates a stray `package-lock.json` and breaks the workspace. Use `pnpm`.
- ❌ Writing `"@repo/ui": "^0.0.0"` or `"file:../../packages/ui"` instead of `workspace:*`.
- ❌ Importing from `apps/*` inside `packages/*`, or from one app into another.
- ❌ Putting business logic, DB queries, or authorization decisions in controllers.
- ❌ Forgetting the `.js` extension on relative imports in `apps/api` — it compiles but fails at runtime.
- ❌ Using `any` to silence the compiler.
- ❌ Empty `catch` blocks or un-awaited promises.
- ❌ Hardcoding credentials, API keys, or connection strings.
- ❌ Committing `.env` / `.env.*` files (only `.env.example` is allowed — see `.gitignore`).
- ❌ Adding Mantine/React as a regular dependency of `@repo/ui` (causes duplicate React/Mantine instances).

## 8. Development Workflow

### Branch naming

```
feat/<short-description>      # feat/issue-labels
fix/<short-description>       # fix/login-redirect
chore/ | refactor/ | docs/ | test/
```

### Commit messages — Conventional Commits

```
<type>(<scope>): <summary in imperative mood>

feat(api): add issue assignment endpoint
fix(web): keep filters when navigating back
chore(ui): bump mantine to 9.7
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`. Scopes: `api`, `web`, `ui`, `contracts`, `repo`.

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

## 10. Deployment

- **Docker:** one multi-stage image per app (`apps/api/Dockerfile` exists), built from the repo root so the workspace is available. Use `turbo prune @repo/api --docker` to produce a minimal build context.
- **API runtime:** `pnpm --filter @repo/api build` then `node dist/main.js` (`start:prod`).
- **Web:** `pnpm --filter @repo/web build` outputs static files to `apps/web/dist` — serve from a CDN/static host and route `/api` to the API.
- **Environment-specific config:** all config comes from env vars; never branch on hostnames. Use `.env` locally and the platform's secret store in staging/production. CORS origin must come from env before deploying.
- **Health check:** `GET /api/health` → `{ status: 'ok', service: 'api', timestamp }`. Use it for container/load-balancer probes.
- **Logging & monitoring:** use Nest's `Logger` (no `console.log`), structured JSON logs in production, include a request ID; never log secrets or PII. Add error tracking/metrics before the first production release.
