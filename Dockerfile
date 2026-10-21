# ==============================================================================
# Multi-stage Dockerfile for Amrutam Telemedicine Backend
# Node.js 22-alpine base image with non-root security context
# ==============================================================================

# --- Stage 1: Build & Dependencies ---
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies required by native packages (e.g. openssl for Prisma)
RUN apk add --no-cache openssl

# Copy package descriptors
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies deterministically
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# --- Stage 2: Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

# Install runtime OpenSSL for Prisma engine
RUN apk add --no-cache openssl wget

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules and Prisma generated client from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma

# Copy application source code
COPY src ./src

# Create non-root user and assign permissions
USER node

# Expose HTTP port
EXPOSE 5000

# Container healthcheck using liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health/live || exit 1

# Start the application server
CMD ["node", "src/server.js"]
