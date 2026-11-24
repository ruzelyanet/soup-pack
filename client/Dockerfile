# Multi-stage build для Nuxt 3 SSR в проде.
FROM node:22-alpine AS builder
WORKDIR /app
# Те же имена env vars, что в старом client/Dockerfile — Coolify прокинет без изменений.
ARG VITE_API_URL
ARG VITE_API_TOKEN
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_TOKEN=$VITE_API_TOKEN
# Дублируем в NUXT_PUBLIC_* — Nitro читает их на сервере через process.env в services/api.ts.
ENV NUXT_PUBLIC_API_URL=$VITE_API_URL
ENV NUXT_PUBLIC_API_TOKEN=$VITE_API_TOKEN
COPY package*.json ./
# shortcut: npm install вместо npm ci — у нас в lock-файле transient conflict
# по cac/commander между Nuxt deps; install разрулит, ci strict падает.
# Переключить на npm ci, когда получится перегенерировать lock без конфликта.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Runtime env for services/api.ts server-side fallback.
ARG VITE_API_URL
ARG VITE_API_TOKEN
ENV NUXT_PUBLIC_API_URL=$VITE_API_URL
ENV NUXT_PUBLIC_API_TOKEN=$VITE_API_TOKEN
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
