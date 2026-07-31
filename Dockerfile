# BUILD 010 (Production Ready) - jalur deploy alternatif di luar Vercel (mis.
# self-host/VPS). Deploy utama aplikasi ini TETAP Vercel (`vercel --prod`, lihat
# DEPLOYMENT.md) - image ini tidak dipakai pipeline Vercel, murni untuk skenario
# di luar itu (staging lokal yang identik dengan production, atau migrasi host
# di masa depan). Multi-stage supaya image akhir hanya berisi output standalone
# Next.js (next.config.mjs: output:'standalone'), bukan devDependencies/source TS.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variabel yang WAJIB ada saat `next build` (shared/auth/jwt.ts throw kalau kosong,
# lihat catatan di .github/workflows/ci.yml) - isi nyata di-supply lewat --build-arg
# saat `docker build`, bukan di-hardcode di sini.
ARG JWT_SECRET_KEY
ARG DATABASE_URL
ENV JWT_SECRET_KEY=$JWT_SECRET_KEY
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001

CMD ["node", "server.js"]
