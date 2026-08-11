# NetLab Coding Standards & Rules

## 1. Clean Architecture & SOLID Standards

- **Single Responsibility**: Each module, class, and component must have exactly one reason to change.
- **Open / Closed**: Vendor syntax and protocol implementations must be extendable via interfaces without modifying core engines.
- **Liskov Substitution**: Any vendor adapter implementing `IVendorAdapter` must function interchangeably in the CLI engine.
- **Interface Segregation**: Prefer lean, specialized interfaces over large monolithic types.
- **Dependency Inversion**: High-level simulation logic must depend on abstractions, never on vendor-specific implementations.

## 2. TypeScript Rules

1. **Strict Null Checks**: `strictNullChecks: true` is strictly enforced.
2. **Explicit Return Types**: All exported functions and methods must declare explicit return types.
3. **No `any`**: The use of `any` is strictly prohibited. Use `unknown` or generics.
4. **Enums & Types**: Standard `enum` or union string types are required.

## 3. UI & Styling Rules

1. **Tailwind CSS v4**: Utility-first styling exclusively.
2. **Lucide Icons**: Standardized icon set (`lucide-react`).
3. **Motion**: Use `@motion/react` or `motion` for layout transitions and gestures.
4. **Touch Friendly**: Touch targets must be at least 44px on tablet/mobile viewports.
