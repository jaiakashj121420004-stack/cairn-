# Cairn API container (CLAUDE.md §3.1b). Build context is the REPO ROOT:
#   docker build -f apps/server/Dockerfile -t cairn-api .
#
# Multi-stage: the `deps` stage installs ONLY the server's workspace subtree
# (`--filter @cairn/server...`) so desktop's native-dep toolchain is never needed; the
# `runtime` stage runs the Fastify server via tsx as the non-root `node` user. The
# server applies pending migrations on boot (src/server.ts), so there is no separate
# migrate step. A distroless final image is a Stage 7 (production-hardening) refinement;
# this slim, non-root image is the working local/CI container.

FROM node:22-slim AS deps
# Pin pnpm to the repo's major (10.x). pnpm 11 dropped the `pnpm.overrides` package.json
# field this lockfile was built with, so a newer pnpm fails the frozen install.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
# Copy every workspace manifest first so pnpm can resolve the graph and the install
# layer caches on lockfile changes only.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/billing-types/package.json packages/billing-types/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-zod/package.json packages/shared-zod/package.json
COPY packages/sync-protocol/package.json packages/sync-protocol/package.json
RUN pnpm install --frozen-lockfile --filter @cairn/server...

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
# Bring the fully linked workspace (node_modules with pnpm symlinks) from `deps`…
COPY --from=deps /repo /repo
# …then overlay the TypeScript sources tsx interprets at runtime (node_modules excluded
# by .dockerignore, so the symlinked deps from the previous layer are preserved).
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-zod ./packages/shared-zod
COPY apps/server ./apps/server
USER node
WORKDIR /repo/apps/server
EXPOSE 3000
# tsx as a Node loader — no pnpm at runtime, no compile step.
CMD ["node", "--import", "tsx", "src/server.ts"]
