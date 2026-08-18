# Public API Reference for @mikrolab/vendors

Public surface di `src/index.ts`:

- `VendorDispatcher` — router murni: `dispatch(vendorId, rawInput, context): string`, `getNodeMemory`, `serializeMemory(): Record<string, NodeMemory>`, `register/getAdapter`, `capabilities`, `exportRunningConfig`, `forgetNodeMemory`, `setNodeModelLabel`.
- `IVendorAdapter` — `vendorId`, `vendorName`, `promptTemplate`, `parseSyntax(rawInput): NormalizedCommand`, `formatResponse(cmdResult): string`.
- Adapter per vendor: `MikroTikVendorAdapter`, `CiscoVendorAdapter`, `CiscoNxosVendorAdapter`, `JuniperVendorAdapter`, `HuaweiVendorAdapter`, `UbiquitiVendorAdapter`, `VyosVendorAdapter`, `FortinetVendorAdapter`, `ArubaVendorAdapter`, `OpenwrtVendorAdapter`, `LinuxDebianVendorAdapter`.
- Kapabilitas: `VENDOR_CAPABILITIES`, `getVendorCapabilities`, `CAPABILITY_LABELS`, tipe `VendorCapabilities`, `CapabilityKey`, `CapabilityStatus`.
- Tipe bersama: `VendorId`, `VendorAdapter`, `VendorContext`, `CommandResult`, `CommandError`, `CliMode`, `ChainEntry`, `ChainEnv`, `NodeMemory`, `MemoryRegistry`.
- Chain: `runChain`, `registerEntries` (side-effect registrasi lengkap dilakukan `src/index.ts`).

Detail lengkap: `src/common/types.ts`, `src/dispatcher/VendorDispatcher.ts`, `src/capabilities.ts`.