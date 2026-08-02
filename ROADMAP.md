# MikroLab Project Roadmap

## Phase 1: Architecture & Foundation (Current - Version 1.0)
- [x] Complete Monorepo folder hierarchy & package structure
- [x] Documentation Suite across all 11 core packages
- [x] Unified Pointer Interaction Engine (Tap, Double Tap, Long Press, Pinch, Pan)
- [x] Responsive IDE Canvas UI with VS Code / Figma inspired aesthetic
- [x] Vendor CLI Terminal Viewport Foundation
- [x] Project Export & Import (`.mlab` schema) with IndexedDB storage
- [x] First-Time Experience Gesture & Mouse Tutorials
- [x] Foundation ZIP Package Export (`MikroLab-Foundation-v1.zip`)

## Phase 2: CLI Grammar & Lexer Engines (v1.1 - v1.3)
- [ ] Implement AST parser in `@mikrolab/cli`
- [ ] Build MikroTik RouterOS grammar adapter (`/ip/address`, `/interface`, `/ping`)
- [ ] Build Cisco IOS grammar adapter (`enable`, `configure terminal`, `interface`)
- [ ] Implement command autocompletion & parameter validation engine

## Phase 3: Core Simulation & Device State Engine (v1.4 - v1.6)
- [ ] Implement Device hardware state tables (RAM, CPU, Interfaces)
- [ ] Connect CLI AST outputs to core device memory mutators
- [ ] Implement VLAN, Bridge, and Sub-interface virtual state engine

## Phase 4: Packet & Protocol Stack Engine (v1.7 - v2.0)
- [ ] Frame encapsulation pipeline (Ethernet II, ARP)
- [ ] IPv4/IPv6 packet router engine & ICMP echo handler
- [ ] OSPF & BGP dynamic routing protocol state machines
- [ ] Live animated packet trace playback on topology canvas
