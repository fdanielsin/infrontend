.PHONY: help install dev build preview test lint format check e2e clean

help:
	@echo "🔧 Svelte Frontend - Available commands:"
	@echo "  make install       - Install dependencies with Bun"
	@echo "  make dev           - Start dev server (http://localhost:5173)"
	@echo "  make build         - Production build"
	@echo "  make preview       - Preview production build"
	@echo "  make test          - Run unit tests"
	@echo "  make e2e           - Run E2E tests with Playwright"
	@echo "  make lint          - Lint code (ESLint + Prettier)"
	@echo "  make format        - Format code with Prettier"
	@echo "  make check         - Type check with SvelteKit"
	@echo "  make clean         - Remove build artifacts"

install:
	@echo "📦 Installing dependencies..."
	bun install

dev:
	@echo "🚀 Starting dev server..."
	bun run dev

build:
	@echo "📦 Building for production..."
	bun run build

preview:
	@echo "👀 Previewing production build..."
	bun run preview

test:
	@echo "🧪 Running unit tests..."
	bun run test:unit

e2e:
	@echo "🧪 Running E2E tests..."
	bun x playwright test

e2e-ui:
	@echo "🧪 Running E2E tests with UI..."
	bun x playwright test --ui

lint:
	@echo "🔍 Linting code..."
	bun run lint

format:
	@echo "✨ Formatting code..."
	bun run format

check:
	@echo "✓ Type checking..."
	bun run check

check-watch:
	@echo "✓ Type checking (watch mode)..."
	bun run check:watch

clean:
	@echo "🧹 Cleaning..."
	rm -rf build
	rm -rf .svelte-kit
	rm -rf coverage
