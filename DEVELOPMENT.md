# MikroLab Development Guidelines

## Workspace Setup

1. **Node.js**: Requires Node.js >= 20.0.0.
2. **PNPM**: Requires PNPM >= 8.0.0.
3. **TypeScript**: Strict mode enabled across all packages (`tsconfig.json`).

```bash
# Install workspace packages
pnpm install

# Run application dev server
pnpm run dev

# Run lint checks across all workspace modules
pnpm run lint

# Build all packages with Turborepo
pnpm run build
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
