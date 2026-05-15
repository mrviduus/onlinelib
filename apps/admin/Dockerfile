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
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install
COPY . .
RUN pnpm build
EXPOSE 81
CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "81"]
