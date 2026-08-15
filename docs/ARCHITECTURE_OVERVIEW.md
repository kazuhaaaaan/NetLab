# NetLab Architecture Overview

Arsitektur aktual (bukan monorepo `@mikrolab/*` — lihat `ARCHITECTURE.md` untuk
detail lapisan & aliran data).

## Lapisan

1. **Presentation** — `src/App.tsx`, komponen `src/components/` (Canvas,
   TerminalPanel, PortInspector, GradingModal, PingPanel, AI chat panel),
   state proyek via `LabProject` (`src/types.ts`).
2. **CLI & Vendors** — `src/engine/index.ts` (`runCliCommand`, entry tunggal
   terminal) → `commandTree` (abbreviation/ambiguity, mode exec/config/
   config-if) → `VendorDispatcher` (`packages/vendors/src/index.ts`, 11 vendor:
   mikrotik, cisco_ios, cisco_nxos, juniper, huawei, ubiquiti, vyos, fortinet,
   aruba, openwrt, linux) + registry kapabilitas jujur
   (`packages/vendors/src/capabilities.ts` — matriks di
   `docs/CAPABILITY_MATRIX.md`).
3. **Networking Engine** — `src/engine/net/`: `NetworkSimulator`
   (packet event-driven: inject → transmit → scheduler → processors),
   processor per perangkat (`RouterProcessor`, `HostProcessor`, switch,
   wireless), layanan (`RoutingProtocolEngine` OSPF/BGP/VRRP,
   `FhrpService`, STP, NAT, ACL, QoS, DHCP, IPv6/NDP/SLAAC).
4. **Data & Persistence** — `src/data/` (deviceModels, cliHints, templates,
   scenarios, guides), `.mlab` schema versioning, IndexedDB, export/import.
5. **AI Mentor (Aikari)** — rule-based + Gemini (`src/modules/ai/llmClient.ts`
   dev-only direct / produksi via proxy `server/index.mjs`).