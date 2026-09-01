# Keep in step with .nvmrc — a Dockerfile cannot read it, so
# scripts/check-node-version.mjs fails CI when they drift.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

COPY . .

EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
