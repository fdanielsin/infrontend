# inFrontend - Svelte + SvelteKit + Bun

Modern, full-stack frontend framework with TypeScript, Tailwind CSS, and testing.

## Stack

- **Framework**: SvelteKit (modern, reactive)
- **Language**: TypeScript with strict mode
- **Runtime**: Bun (ultra-fast)
- **Styling**: Tailwind CSS
- **Testing**: Vitest (unit + component tests)
- **Linting**: ESLint + Prettier
- **Dev Server**: Vite (instant HMR)

## Quick Start

```bash
# Install dependencies
bun install

# Run dev server
bun run dev
```

Server runs on `http://localhost:5173`

## Build

```bash
bun run build
bun run preview
```

## Test

```bash
bun run test
```

## Project Structure

```
src/
├── routes/       # File-based routing
├── lib/          # Components & utils
└── app.css       # Tailwind styles
```

## Next Steps

- Build UI components
- Connect to backend API (`http://localhost:8080`)
- Add form validation & error handling
- Set up Svelte stores for state management
- Deploy to Vercel/Netlify
