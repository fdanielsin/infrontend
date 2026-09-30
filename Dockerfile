FROM oven/bun:1.3.0 AS builder

WORKDIR /app

# SvelteKit bakes PUBLIC_* variables into the bundle at build time, so the
# backend URL cannot be changed when the container starts.
ARG PUBLIC_API_URL
RUN test -n "$PUBLIC_API_URL" || { echo "Build argument PUBLIC_API_URL is required" >&2; exit 1; }

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build && find build -name '*.map' -delete

FROM oven/bun:1.3.0-slim

WORKDIR /app

# adapter-node bundles the dependencies: only the build output is needed.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/build ./build

ENV NODE_ENV=production
USER bun
EXPOSE 3000

CMD ["bun", "build/index.js"]
