FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.workspace.json biome.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
COPY native ./native
COPY .env.example ./.env.example
COPY .env.windows.example ./.env.windows.example
COPY .env.linux.example ./.env.linux.example
COPY vitest.config.ts ./vitest.config.ts
COPY vitest.integration.config.ts ./vitest.integration.config.ts

RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi
RUN pnpm run build

EXPOSE 4100
CMD ["node", "apps/gateway/dist/index.js"]