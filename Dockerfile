# syntax=docker/dockerfile:1
# ============================================================
# WA-AKG — Production Dockerfile
# ------------------------------------------------------------
# This app uses a custom server (Next.js + Socket.io + Baileys)
# that runs via tsx, so it requires an always-on host (NOT Vercel).
# Works great with Railway / Render / Fly.io / VPS.
# ============================================================

FROM node:20-alpine AS base
# libc6-compat + openssl: for native modules (sharp) & Prisma engine
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- deps: install all dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY patches ./patches
# need devDependencies too (next build + next-swagger-doc used at runtime)
RUN npm ci || npm install
RUN npx prisma generate

# ---------- builder: next build ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# dummy DATABASE_URL so build doesn't fail during env evaluation (build doesn't connect to DB)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npm run build

# ---------- runner: run custom server ----------
FROM base AS runner
ENV NODE_ENV=production
# Run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
# Copy entire built app (server runs via tsx -> needs TypeScript source)
COPY --from=builder --chown=nextjs:nodejs /app ./
# Media folder (uploads) — should be mounted as volume for persistence across restarts
RUN mkdir -p /app/data/media && chown -R nextjs:nodejs /app/data
USER nextjs
EXPOSE 3030
# Host injects PORT; server reads process.env.PORT (default 3030)
CMD ["npm", "run", "start"]
