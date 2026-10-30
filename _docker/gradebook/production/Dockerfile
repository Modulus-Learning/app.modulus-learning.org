# Node LTS on Debian Slim (glibc). Automatically tracks the active LTS line (currently 26.x).
FROM node:lts-slim AS base

# PNPM ENVs
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# See: https://github.com/nodejs/corepack/issues/612
ENV COREPACK_INTEGRITY_KEYS=0

# Create nginx user/group to match Alpine convention used throughout this Dockerfile
RUN groupadd --system nginx && useradd --system --gid nginx --no-create-home --shell /usr/sbin/nologin nginx

# Install necessary packages: Nginx, Supervisord, and netcat (for health-check probing in start-nginx.sh)
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# deps
# Add node deps
FROM base AS deps

WORKDIR /app

COPY apps/gradebook/package.json ./apps/gradebook/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/host-tanstack-start/package.json ./packages/host-tanstack-start/package.json
COPY packages/lti/package.json ./packages/lti/package.json
COPY packages/lms-canvas/package.json ./packages/lms-canvas/package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack enable pnpm && pnpm install --frozen-lockfile

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# production-deps
# Setup production node_modules
FROM base AS production-deps

WORKDIR /app

# NOTE: prune is not currently supported recursively or in monorepos.
# https://pnpm.io/cli/prune - prune is not currently supported recursively.
# COPY --from=deps /app/apps/gradebook/node_modules /app/apps/gradebook/node_modules
# COPY --from=deps /app/packages/core/node_modules /app/packages/core/node_modules

# RUN pnpm prune --prod

COPY apps/gradebook/package.json ./apps/gradebook/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/host-tanstack-start/package.json ./packages/host-tanstack-start/package.json
COPY packages/lti/package.json ./packages/lti/package.json
COPY packages/lms-canvas/package.json ./packages/lms-canvas/package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# RUN pnpm install --prod;
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack enable pnpm && pnpm install --prod --frozen-lockfile


# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# build
# Build the app
FROM base AS build

WORKDIR /app

ENV TURBO_TELEMETRY_DISABLED=1
# A local `vite build` peaks near 2 GB resident; 3 GB of heap leaves headroom.
ENV NODE_OPTIONS="--max-old-space-size=3072"

COPY --from=deps /app/apps/gradebook/node_modules /app/apps/gradebook/node_modules
COPY --from=deps /app/packages/core/node_modules /app/packages/core/node_modules
COPY --from=deps /app/packages/host-tanstack-start/node_modules /app/packages/host-tanstack-start/node_modules
COPY --from=deps /app/packages/lti/node_modules /app/packages/lti/node_modules
COPY --from=deps /app/packages/lms-canvas/node_modules /app/packages/lms-canvas/node_modules
COPY --from=deps /app/node_modules /app/node_modules

# Copy source code for the project (manually excluding _docker)
COPY apps/gradebook apps/gradebook
COPY packages/core packages/core
COPY packages/host-tanstack-start packages/host-tanstack-start
COPY packages/lti packages/lti
COPY packages/lms-canvas packages/lms-canvas
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# Setup pnpm and global tools in a separate layer to reduce peak memory during build
RUN corepack enable pnpm

# Run build (turbo): lti, lms-canvas, core and the host package with `tsc`, then the gradebook's
# TanStack Start build into
# apps/gradebook/.output. The client bundle inlines the public VITE_* values
# from the committed apps/gradebook/.env; .env.local never enters the image.
RUN pnpm run build

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# final
#
# Rebuild the source code only when needed
# This may be the case that you would try
# to build the app based on some `X_TAG` in my case (Git commit hash)
# but the code hasn't changed.
FROM base

ARG APP_VOLUME
ARG VERSION

LABEL io.infonomic.name="modulus_web" \
      io.infonomic.version="${VERSION}" \
      io.infonomic.maintainer="Anthony Bouch <anthony@infonomic.io>" \
      io.infonomic.description="Modulus website app container."

ENV NODE_ENV=production
ENV TURBO_TELEMETRY_DISABLED=1
# Nitro's graceful close: in-flight HTTP gets 25 s after SIGTERM, inside the
# app's job drain (SHUTDOWN_DRAIN_SECONDS) and supervisord's stopwaitsecs.
ENV SERVER_SHUTDOWN_TIMEOUT=25

RUN set -eux; \
  mkdir -p /app; \
  mkdir -p /app/node_modules/.cache; \
  mkdir -p /app/apps/gradebook; \
  mkdir -p /app/packages/core; \
  mkdir -p /app/packages/lti; \
  mkdir -p /var/run/nginx-cache; \
  chown -R nginx:nginx /app;  \
  chown -R nginx:nginx /run; \
  chown -R nginx:nginx /var/lib/nginx; \
  chown -R nginx:nginx /var/log/nginx; \
  chown -R nginx:nginx /var/run/nginx-cache;

COPY _docker/gradebook/nginx/ /etc/nginx/
COPY _docker/gradebook/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

USER nginx
VOLUME ${APP_VOLUME}
WORKDIR /app

COPY --from=production-deps /app/packages/core/node_modules /app/packages/core/node_modules
COPY --from=production-deps /app/node_modules /app/node_modules

# core package
COPY --from=build --chown=nginx:nginx /app/packages/core/dist /app/packages/core/dist
COPY --from=build --chown=nginx:nginx /app/packages/core/package.json /app/packages/core/package.json

# lti package: a runtime dependency of core's dist (the `modulus` command).
# The Nitro bundle inlines the @modulus-learning packages, so lms-canvas and
# the host package are not needed at runtime.
COPY --from=production-deps /app/packages/lti/node_modules /app/packages/lti/node_modules
COPY --from=build --chown=nginx:nginx /app/packages/lti/dist /app/packages/lti/dist
COPY --from=build --chown=nginx:nginx /app/packages/lti/package.json /app/packages/lti/package.json

# main app: the Nitro server bundle and its public assets (.output), plus the
# production node_modules its externals (React and friends) resolve from. Docs
# content is bundled into .output, so src/content is not copied.
COPY --from=production-deps --chown=nginx:nginx /app/apps/gradebook/node_modules /app/apps/gradebook/node_modules
COPY --from=build --chown=nginx:nginx /app/apps/gradebook/.output /app/apps/gradebook/.output
COPY --from=build --chown=nginx:nginx /app/apps/gradebook/package.json /app/apps/gradebook/package.json
COPY --from=build --chown=nginx:nginx /app/apps/gradebook/email-templates /app/apps/gradebook/email-templates

# Root package.json and files
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/turbo.json /app/turbo.json

COPY _docker/gradebook/start-nginx.sh /app/start-nginx.sh
COPY _docker/gradebook/start-node.sh /app/start-node.sh

EXPOSE 8000

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
# HEALTHCHECK --timeout=10s CMD curl --silent --fail http://127.0.0.1:8000/elb-status || exit 1
