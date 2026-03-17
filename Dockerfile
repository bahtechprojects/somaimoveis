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
# Copy Prisma schema (needed for db push and generate in production)
COPY --from=builder /app/prisma ./prisma

# Install Prisma CLI, @prisma/client and bcryptjs for entrypoint seed
# Also generate Prisma client (must be done as root before USER nextjs)
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
RUN npm install prisma@6 @prisma/client@6 bcryptjs && \
    npx prisma generate --schema=./prisma/schema.prisma

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create uploads and cache directories with correct permissions
RUN mkdir -p apps/web/public/uploads apps/web/.next/cache && \
    chown -R nextjs:nodejs apps/web/public/uploads apps/web/.next/cache

USER nextjs

EXPOSE 3000

CMD ["./entrypoint.sh"]
