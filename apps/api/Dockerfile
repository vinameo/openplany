# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/api/Dockerfile -t openplany-api .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# 1. Prune the monorepo down to @repo/api and its workspace dependencies.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @repo/api --docker

# 2. Install all deps (cached on lockfile changes only) and build.
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@repo/api

# 3. Production dependencies only.
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# 4. Minimal runtime image.
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
WORKDIR /app

# Whole tree: the hoisted linker can still nest packages under apps/api/node_modules.
COPY --from=prod-deps --chown=node:node /app ./
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
