# Apply worker (design doc §11). Build context = monorepo root.
#   docker build -f apps/worker/Dockerfile -t jobposted-worker .
# Node 22+ is required by pnpm 11 (it uses node:sqlite, unavailable on Node 20).
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Workspace manifests + the packages the worker depends on.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .npmrc* ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Install only the worker and its workspace deps.
RUN pnpm install --filter "@jobposted/worker..." --frozen-lockfile

# Chromium + system libraries for Playwright (matches the installed Playwright version).
RUN pnpm --filter @jobposted/worker exec playwright install --with-deps chromium

WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
