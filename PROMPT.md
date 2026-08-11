# NetLab System Prompt Specification

This file serves as the system prompt directive for AI coding assistants and autonomous agents working on the NetLab repository.

## Core Directives for AI Agents:
1. **Never pollute Core Logic with Vendor Syntax**: Core simulation engine modules (`@mikrolab/core`, `@mikrolab/packet`, `@mikrolab/protocols`) must remain 100% vendor-neutral.
2. **Never hardcode Mouse or Touch logic separately**: Always use the unified Pointer Events abstraction in `@mikrolab/shared` and `@mikrolab/canvas`.
3. **Always preserve Clean Architecture**: Check interfaces in `@mikrolab/sdk` before writing new implementations.
4. **Maintain 100% Documentation Sync**: Any change to API signatures must update the corresponding package's `API.md` and `CONTRACT.md`.
