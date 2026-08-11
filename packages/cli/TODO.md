# TODO Items for @mikrolab/cli

## Status: SELESAI (inti)
- [x] Lexer → Parser → AST → NormalizedCommand (CLIParser, 71 baris)
- [x] Grammar vendor & validator lengkap diimplementasikan di packages/vendors (VendorDispatcher, 6053 baris) — parser/AST + command executor untuk 10 vendor
- [x] Autocompletion Tab & bantuan `?` per vendor: src/data/cliHints.ts (dipakai TerminalPanel)
- [x] Diuji: run_all_tests.mts §2-§3 vendor engine & lanjutan (0 failed, 440 total)

## Berikutnya
- [ ] Migrasi/sinkronisasi parser penuh dari packages/vendors ke package ini (pemurnian arsitektur monorepo)
- [ ] Unit test khusus per package (isolated) & typedoc