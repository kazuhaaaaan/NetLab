# NetLab Development Guidelines

## Setup

1. **Node.js**: Requires Node.js >= 20.0.0.
2. **npm**: package manager (npm >= 9), lockfile `package-lock.json`.
3. **TypeScript**: Strict mode enabled across all packages (`tsconfig.json`).

```bash
# Install dependencies
npm install

# Run application dev server
npm run dev

# Run typecheck (lint)
npm run lint

# Run all tests (unit + scenario + cross-vendor interop)
npm test

# Production build
npm run build
```

## Adding a New Package to `packages/`

Every package created in `packages/` MUST include:
1. `package.json` with `@mikrolab/*` namespace.
2. `src/index.ts` declaring public exports.
3. Complete Documentation Suite:
   - `README.md`
   - `PROMPT.md`
   - `CONTRACT.md`
   - `TODO.md`
   - `ARCHITECTURE.md`
   - `API.md`
   - `EXAMPLES.md`
