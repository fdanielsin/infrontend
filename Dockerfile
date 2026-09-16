# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install

COPY . .
RUN bun run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/build ./build
COPY package.json ./

RUN npm install --production

EXPOSE 3000

ENV NODE_ENV=production
ENV PUBLIC_API_URL=http://localhost:8080

CMD ["node", "build"]
