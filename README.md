# NetLab: Enterprise Browser-Based Networking Laboratory

> **Complete In-Browser Multi-Vendor Networking Simulation Platform**  
> *Architected for browser execution with a real packet engine — ping, routing, VLAN, DHCP, NAT, OSPF, BGP results come from actual simulated state, never hard-coded.*

---

## 🌟 Overview

**NetLab** is a next-generation browser-based enterprise networking laboratory. It is **not** merely a router emulator; it is a full-fledged networking simulation ecosystem capable of simulating multi-vendor enterprise hardware entirely inside modern client web browsers (Chromium, Firefox, Safari) — with zero server dependencies for the simulation itself.

**Live app:** <https://netlab.kazudev.my.id> · **Repository:** <https://github.com/kazuhaaaaan/NetLab>

### Supported Vendors
- **MikroTik RouterOS**
- **Cisco IOS & Cisco NX-OS**
- **Juniper JunOS**
- **Huawei VRP**
- **Ubiquiti EdgeOS**
- **VyOS**
- **Fortinet FortiOS**
- **Aruba AOS**
- **OpenWrt**

Vendor CLI syntax is parsed into vendor-neutral commands, applied to one shared
simulation state, and every `show`/`print`/`display` output reflects the **actual
engine state** — link status, ARP cache, routing table, OSPF/BGP session state,
DHCP leases, NAT translations. Unsupported features fail honestly instead of
pretending to work.

---

## 🏛️ Application Architecture & Layers

NetLab follows a strict single-direction visual-to-engine pipeline. Vendor CLI syntax is strictly decoupled from core simulation logic using Vendor Adapters, AST Parsers, and Command Executors.

```
Browser (React 19 + TypeScript 5)
  ↓
UI Components (src/components)
  ↓
Canvas Editor & Gesture Interaction (src/components/Canvas.tsx)
  ↓
Terminal / CLI Viewport (src/components/TerminalPanel.tsx)
  ↓
Vendor CLI Adapters (packages/vendors)
  ↓
Command Executor & Normalized Commands
  ↓
Authoritative Network Simulator (src/engine/net/core/NetworkSimulator.ts)
  ├─ Ethernet switching (MAC learning, flooding, VLAN, STP)
  ├─ IPv4/IPv6 routing (LPM, TTL, ICMP errors, static/OSPF/BGP routes)
  ├─ ARP / Neighbor Discovery (stateful cache)
  ├─ DHCP (DISCOVER/OFFER/REQUEST/ACK + lease state)
  ├─ NAT (translation session state)
  └─ Protocol state (OSPF adjacency, BGP session, VRRP/FHRP)
  ↓
Packet Events & Simulation Results
  ↓
UI / CLI / Packet Inspector / Diagnostics / AI Mentor
```

> **Source of truth:** the network engine. The UI, CLI, diagnostics, and AI
> mentor all read from it — none of them fabricate network behavior.

---

## 📦 Repository Layout

The app is an **npm-based single application** (Vite + React); the `packages/`
directories hold the reference layered architecture (vendor adapters, packet/
protocol cores) used by the engine and tests.

| Location | Responsibility |
|---|---|
| `src/components` | UI: canvas, sidebar, terminal, panels, modals, landing page |
| `src/engine/net/core` | Authoritative simulation engine (L2/L3, protocols, services) |
| `src/engine/sim` | Simulator integration & ping output formatting |
| `src/engine/lab` | Lab scenario engine, grading & diagnostics |
| `packages/vendors` | Vendor CLI adapters + normalized command pipeline |
| `packages/protocols`, `packages/packet`, `packages/core` | Reference packet/protocol cores |
| `server/index.mjs` | Optional AI Mentor proxy (Gemini) — key stays server-side |
| `tests/` + `run_all_tests.mts` | Unit, scenario, round-trip & cross-vendor interoperability tests |

---

## 🎮 Interaction

- **Tap / Click**: Select device or port.
- **Double Tap / Double Click**: Open interactive CLI terminal.
- **Long Press / Right Click**: Open contextual action menu.
- **Pinch Zoom / Scroll**: Smooth canvas scale adjustment.
- **Two Finger Pan / Middle Drag**: Infinite viewport translation.
- **Port-to-Port Tap / Drag**: Instant interactive cable creation.

---

## 💾 Storage & File Format

- **Format**: `.mlab` JSON (versioned `schemaVersion` + `engineVersion`, validated & migrated on import — unknown/newer schemas are rejected gracefully).
- **In-Browser Persistence**: IndexedDB with LocalStorage fallback for auto-saving lab sessions.
- **Export / Import**: Single-click export/import of full lab topologies; imported files are treated as untrusted input.
- **Running-Config Export**: Per-device config in the vendor's own syntax (RouterOS `.rsc`, IOS/NX-OS, Junos, VRP, EdgeOS, ArubaOS-CX, OpenWrt, Linux) with preview, per-file download, or ZIP for the whole lab.
- **Topology Validation**: duplicate IP, subnet conflicts, netmask mismatch on direct links, VLAN without a switch, unconfigured ports, network/broadcast-as-host, gateway out-of-subnet, `/31`/`/32` handling.
- **Physical Link State**: deleting a cable marks the port "not connected" in
  `show` output (config stays intact); `shutdown` shows "administratively down".

---

## 🛠️ Quick Start

```bash
# Clone the repository
git clone https://github.com/kazuhaaaaan/NetLab.git
cd NetLab

# Install dependencies (npm)
npm install

# Run the dev server (Vite on http://localhost:3000)
npm run dev
```

### Verify

```bash
npm run typecheck   # TypeScript (strict)
npm test            # 800+ unit/scenario/interop tests
npm run build       # production build
```

### AI Mentor (optional)

The AI chat panel works with two modes:

1. **Rule-based fallback (default, zero setup)** — selalu tersedia, lokal di browser.
2. **Gemini via server proxy** — `GEMINI_API_KEY=... node server/index.mjs`
   (atau `npm run dev:ai`), lalu buka aplikasi. Key **hanya** server-side
   (`GEMINI_API_KEY`), dikirim via `ALLOWED_ORIGINS=https://netlab.kazudev.my.id`
   untuk produksi. Lihat `.env.example` untuk semua opsi.

> Mode langsung browser→Gemini dengan `VITE_GEMINI_API_KEY` hanya aktif saat
> `npm run dev` dan **tidak pernah** masuk bundle produksi.

---

## 📜 License & Open Source

Licensed under the **Apache 2.0 License**. Free for educational, enterprise, and personal networking practice.