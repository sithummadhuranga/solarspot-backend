# Stage 1: install all deps (dev + prod) — used by local dev
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json nodemon.json ./
RUN npm ci

# Stage 2: compile TypeScript — used by production runner
FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
COPY app.ts server.ts ./
RUN npm run build

# Stage 3: lean production image
FROM node:20-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["node", "dist/server.js"]
