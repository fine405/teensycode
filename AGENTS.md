# Project Instructions

## Commands

- `npm run typecheck` checks TypeScript.
- `npm test` runs the deterministic test suite with Bun.
- `bun run index.ts . "<prompt>"` runs the coding agent against this project.

## Architecture

- `index.ts` is the CLI composition root.
- `src/` contains harness components that do not depend on the CLI.
- `tests/` contains focused Bun tests for deterministic behavior.

## Style

- Keep each course lesson change minimal and independently understandable.
- Prefer named exports for reusable harness components.
- Do not commit `.env.local` or API keys.
