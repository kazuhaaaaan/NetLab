# Netlab: Enterprise Browser-Based Networking Laboratory Foundation

> **Complete In-Browser Multi-Vendor Networking Simulation Platform**  
> *Architected for browser execution with Clean Architecture, SOLID principles, and zero server dependencies.*

---

## 🌟 Overview

**MikroLab** is a next-generation browser-based enterprise networking laboratory. It is **not** merely a router emulator; it is a full-fledged modular networking simulation ecosystem capable of simulating multi-vendor enterprise hardware entirely inside modern client web browsers (Chromium, Firefox, Safari).

### Supported Vendors (Roadmap & Vendor Adapters)
- **MikroTik RouterOS**
- **Cisco IOS & Cisco NX-OS**
- **Juniper JunOS**
- **Huawei VRP**
- **Ubiquiti EdgeOS**
- **VyOS**
- **Fortinet FortiOS**
- **Aruba AOS**
- **OpenWrt**

---

## 🏛️ Application Architecture & Layers

MikroLab follows a strict single-direction visual-to-engine pipeline. Vendor CLI syntax is strictly decoupled from core simulation logic using Vendor Adapters, AST Parsers, and Command Executors.

```
Browser (React 19 + TypeScript 5)
  ↓
React UI (@mikrolab/ui)
  ↓
Canvas Engine (@mikrolab/canvas)
  ↓
Sidebar & Inspector Components
  ↓
Terminal / CLI Viewport (@mikrolab/terminal)
  ↓
CLI Grammar Engine (@mikrolab/cli)
  ↓
Vendor Adapter Layer (@mikrolab/vendors)
  ↓
Command Executor & AST Transformer
  ↓
Core Simulation Engine (@mikrolab/core)
  ↓
Packet Processing Engine (@mikrolab/packet)
  ↓
Protocol Stack Pipeline (@mikrolab/protocols)
  ↓
Renderer & Topology State Synchronizer
```

---

## 📦 Workspace Package Layout

MikroLab is structured as a **PNPM Workspace** powered by **Turborepo** and **TypeScript Project References**.

| Package Directory | Package Name | Responsibility |
|---|---|---|
| `packages/ui` | `@mikrolab/ui` | VS Code/Figma inspired UI design system, panels, modals, gesture toolbars |
| `packages/canvas` | `@mikrolab/canvas` | 60 FPS gesture-enabled infinite canvas, SVG cable renderer, node selection |
| `packages/terminal` | `@mikrolab/terminal` | Multi-tab vendor terminal viewport with authentic prompt styling & history |
| `packages/core` | `@mikrolab/core` | Vendor-agnostic topology state engine, device lifecycle, event bus |
| `packages/cli` | `@mikrolab/cli` | Lexer, Parser, AST generator, Command Object builder |
| `packages/packet` | `@mikrolab/packet` | Binary packet buffers, frame encapsulation/decapsulation pipeline |
| `packages/protocols` | `@mikrolab/protocols` | Ethernet, ARP, IPv4, IPv6, ICMP, OSPF, BGP protocol logic |
| `packages/devices` | `@mikrolab/devices` | Virtual hardware definitions (interfaces, MAC tables, memory buffers) |
| `packages/vendors` | `@mikrolab/vendors` | Vendor CLI adapters (MikroTik, Cisco, Juniper, etc.) translating syntax to Command Objects |
| `packages/sdk` | `@mikrolab/sdk` | Plugin extension SDK for third-party vendor adapters & custom lab components |
| `packages/shared` | `@mikrolab/shared` | Universal types, math utilities, geometric helpers, pointer gesture models |

---

## 🎮 Unified Pointer Interaction Engine

MikroLab uses a single, unified **Pointer Events Interaction Engine** (`@mikrolab/canvas` & `@mikrolab/shared`), eliminating separate touch and mouse codepaths.

- **Tap / Click**: Select device or port.
- **Double Tap / Double Click**: Open interactive CLI terminal.
- **Long Press / Right Click**: Open contextual action menu.
- **Pinch Zoom**: Smooth canvas scale adjustment using pointer touch deltas.
- **Two Finger Pan / Middle Drag**: Infinite viewport translation.
- **Port-to-Port Tap / Drag**: Instant interactive cable creation.
- **Hold & Drag**: Multi-device selection bounding box.

---

## 💾 Storage & File Format

- **Format**: `.mlab` JSON Schema (supports compression & metadata).
- **In-Browser Persistence**: IndexedDB with LocalStorage fallback for auto-saving lab sessions.
- **Export / Import**: Seamless single-click export and import of full lab topologies.

---

## 🛠️ Quick Start

```bash
# Clone the repository
git clone https://github.com/mikrolab/mikrolab.git
cd mikrolab

# Install dependencies using PNPM
pnpm install

# Run dev server with Turbo
pnpm run dev
```

---

## 📜 License & Open Source

Licensed under the **Apache 2.0 License**. Free for educational, enterprise, and personal networking practice.
