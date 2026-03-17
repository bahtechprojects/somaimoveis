# ---- Base ----
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Switch Prisma to PostgreSQL for production
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# Generate Prisma client (Linux binary)
RUN pnpm db:generate

# Build Next.js (standalone)
RUN cd apps/web && pnpm build

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy static files
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
# Copy public files
COPY --from=builder /app/apps/web/public ./apps/web/public
# Copy Prisma schema (needed for migrations in production)
COPY --from=builder /app/prisma ./prisma

# Install Prisma CLI and bcryptjs for entrypoint seed
RUN npm install -g prisma@6 && npm install bcryptjs

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create uploads directory
RUN mkdir -p apps/web/public/uploads && chown -R nextjs:nodejs apps/web/public/uploads

USER nextjs

EXPOSE 3000

CMD ["./entrypoint.sh"]
