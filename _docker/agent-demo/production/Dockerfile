# Node LTS on Debian Slim (glibc). Automatically tracks the active LTS line (currently 24.x).
FROM node:lts-slim AS base

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apt-get update -qq && \
  apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy files needed for installing node modules
COPY --link pnpm-workspace.yaml                pnpm-workspace.yaml
COPY --link pnpm-lock.yaml                     pnpm-lock.yaml
COPY --link package.json                       package.json
COPY --link apps/agent/package.json            apps/agent/package.json
COPY --link apps/agent-demo/react/package.json apps/agent-demo/react/package.json

# Prepare pnpm and install node modules
# See: https://github.com/nodejs/corepack/issues/612
ENV COREPACK_INTEGRITY_KEYS=0
ENV NODE_ENV="production"
RUN corepack enable pnpm
RUN pnpm install --frozen-lockfile --prod=false

# Build agent
COPY --link apps/agent apps/agent
RUN cd apps/agent && pnpm build

# Build demo app
COPY --link apps/agent-demo/react apps/agent-demo/react
RUN cd apps/agent-demo/react && pnpm build

# ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
# Final stage for app image
FROM nginx

COPY _docker/agent-demo/nginx /etc/nginx

# Copy built application
COPY --from=build /app/apps/agent-demo/react/dist /app

# Start the server by default, this can be overwritten at runtime
EXPOSE 8000
CMD [ "/usr/sbin/nginx", "-g", "daemon off;" ]
HEALTHCHECK --timeout=10s CMD curl --silent --fail http://127.0.0.1:8000/elb-status || exit 1
