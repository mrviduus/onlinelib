# Build static admin assets at image-build time, serve them via `vite preview`.
#
# Previously this Dockerfile ran `pnpm dev` (Vite dev server) in prod. That meant every
# request hit vite's on-the-fly transformer, and every container rebuild ran
# `pnpm install` without a lockfile — any unbounded version drift in vite or
# @vitejs/plugin-react could surface as "Failed to parse source for import analysis"
# (the error overlay even mis-attributed the failing file to the Dockerfile). Building
# at image-build time pins behavior to whatever `vite build` produced, and `vite
# preview` then just serves the prebuilt `dist/` — no on-the-fly transform.
#
# pnpm pinned to a fixed version (not `pnpm@9`) so corepack doesn't drift across
# rebuilds. /api is proxied by nginx upstream, so this container doesn't need to.
# Keep in step with .nvmrc — a Dockerfile cannot read it, so
# scripts/check-node-version.mjs fails CI when they drift.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
# --frozen-lockfile: fail the build if package.json drifted from the lockfile
# instead of silently updating. Catches dep changes that weren't reviewed
# locally, and removes the class of "different rebuild → different versions"
# bugs that surfaced when this container ran `vite dev` in prod.
RUN pnpm install --frozen-lockfile
COPY . .
# VITE_API_URL must be set at BUILD time — `vite build` bakes import.meta.env.*
# into the JS bundle. Setting it at container runtime via docker-compose
# `environment:` is too late; build already used the fallback default and
# burned `http://localhost:8080` into the bundle, which the browser then
# tried to call directly (ERR_CONNECTION_REFUSED). `/api` is a relative
# path → nginx handles the proxy upstream in production.
ENV VITE_API_URL=/api
RUN pnpm build
EXPOSE 81
CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "81"]
