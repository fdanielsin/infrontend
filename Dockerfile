# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

ENV NODE_ENV=production
ENV PUBLIC_API_URL=http://localhost:8080

CMD ["bun", "build/index.js"]
