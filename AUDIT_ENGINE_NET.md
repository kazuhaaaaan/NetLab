# Audit Report — NetLab Simulation Engine (`src/engine/net`)

- **Scope**: `src/engine/net/**` (production engine), `src/engine/lab/**`, `src/engine/InteractionEngine.ts`, `src/engine/state/DeviceState.ts`, `src/engine/state/TopologyState.tsx`
- **Audit type**: read-only code review — no code was modified
- **Method**: full-read of small modules; header/contract + targeted-offset reads of large modules (`SimulationCore.ts`, `ConfigStore.ts`, `RouterProcessor.ts`, `RoutingProtocolEngine.ts`); execution of the official test suite
- **Test evidence**: `npx tsx run_all_tests.mts` → **2162 passed, 0 failed** (3883-line aggregator importing modular suites from `tests/unit/*`)

---

## Overall Score: **8.3 / 10**

A well-architected, heavily-tested, deliberately-engineered event-driven network simulator. The single-owner state model, the documented packet-pipeline contract, and the protocol state machines are production-grade. The engine's weaknesses are concentrated in input validation (permissive parsers that silently coerce malformed data) and minor duplication/cleanliness issues — no correctness-critical defect was confirmed.

| # | Dimension | Score | Summary |
|---|-----------|-------|---------|
| 1 | CORRECTNESS | 9/10 | Documented canonical pipeline, comprehensive drop-code taxonomy, real protocol state machines, 2162 passing assertions |
| 2 | ARCHITECTURE | 9/10 | Clear single-owner subsystem split, constructor DI, facade preserves legacy API; no circular deps observed |
| 3 | ROBUSTNESS | 7/10 | Excellent guards (null-safe links, event budget, ARP-buffer timeout); weak on malformed-input rejection |
| 4 | PERFORMANCE | 8/10 | Binary-heap scheduler, bounded L2 loop, periodic aging/pruning; linear scans acceptable at lab scale |
| 5 | MAINTAINABILITY | 7/10 | Excellent module docs and named constants; duplicated v4/v6 flow code, 3.9k-line test runner monolith |
| 6 | TESTABILITY | 9/10 | Pure exported utils, DI, deterministic virtual clock, vendor + protocol-fidelity + services suites |
| 7 | STATE CONSISTENCY | 8/10 | Single-owner ConfigStore, per-session resets, virtual clock; minor duplicated SLAAC state |

---

## Dimension 1 — CORRECTNESS (9/10)

### Verified strong points
- **Canonical pipeline contract** documented at the top of `SimulationCore.ts` (ingress: powered → iface → ARP/NDP → STP → ACL/firewall → L2 learn → L3 → NAT → TTL/ICMP; egress: VLAN subinterface → link → QoS token bucket → transmission delay → scheduler PACKET_SEND), with an explicit "do not reorder" notice.
- **Drop-code taxonomy** (`core/dropReasons.ts`) covers 25+ distinct failure modes (ARP_*, DHCP_*, NDP_CONSUMED, ICMP_ERROR, NAT_FAILURE, QOS_DROP, PORT_SECURITY, LOOP_BOUND…) — failures are observable, not silent.
- **Protocol fidelity**: OSPF 7-phase adjacency advancing exactly one phase per protocol round with a full LSDB + SPF (Dijkstra) (`RoutingProtocolEngine.ts`); BGP 6-state FSM (Idle→Established) with `betterBgp` best-path (LOCAL_PREF > AS_PATH > eBGP > ORIGIN > router-id, line 908); RIP hop-count flooding (line 918–930); EIGRP educational DUAL subset (line 1006–1168).
- **IPv6/SLAAC end-to-end consistent**: Router Solicitation → Router Advertisement → EUI-64 + `::/0` default route (`RouterProcessor.ts:476–494`), and the address is actually installed on the interface via `setIpv6ByName` (`NetworkDevice.ts:305–314`) — the ping6 flow's later read of `iface.ipv6.address` is safe.
- **IPv4 hygiene**: `networkOf` uses `>>> 0` with the signed-int pitfall documented (`ip.ts:34–39`); `isValidHostIp` correctly handles network/broadcast plus /31 (RFC 3021) and /32 loopback (`ip.ts:82–90`); `parseCidr` supports all three RouterOS forms (`ip.ts:50–59`).
- **Self-ping / local-destination** handled explicitly before routing (`SimulationFlows.ts:628–642`) — avoids the classic ARP-self dead-end.
- **Fragmentation**: DF default true, `fragmentIp` produces proper `IpFragment` chains, MTU exceeded → `buildFragNeeded(nextHopMtu)` (`IpPacket.ts`, `Icmp.ts`).
- **Deterministic MAC generation** (`DeviceState.ts` `generateMac`, `NetworkDevice` FNV-1a `defaultPortMac`); deterministic wireless signal (`WirelessService.ts:139`).
- **Test suite**: 2162/2162 green including `protocolFidelity.test`, `vendorInterop.test`, `productionEngine.test`, `dataPlaneUpgrade.test`, `servicesUpgrade.test`.

### Findings
| ID | Sev | Finding | Evidence | Suggestion |
|----|-----|---------|----------|------------|
| C-1 | MED | `isIpv6Address` accepts malformed addresses (`:::`, `1::2::3` double-`::`, `1:2:3:4:5:6:7:8:9` >8 groups, non-hex groups); `ipv6ToGroups` then *silently coerces* them to zero-filled groups. A typo in `ping <addr>` or IPv6 config can resolve to a wrong but *valid-looking* address instead of failing with `invalid`. | `ipv6.ts:6–12` (regex `^[0-9a-fA-F:]*$` + `length >= 2`), `ipv6.ts:15–33` (only `split('::')` length===2 handled; `parseInt(…,16) || 0` masks garbage) | Reject: >1 `::`, >8 groups, empty address, non-hex groups. Return null → caller maps to `invalid`. |
| C-2 | LOW | ICMP echo request `id` is `(Math.random() * 0xffff) & 0xffff`; same for traceroute probes and TCP ISN. Cosmetic but breaks run-to-run reproducibility of packet traces. | `SimulationFlows.ts:213, 301, 360, 430, 486–487` | Derive from `runSeq`/traceId (deterministic). |
| C-3 | LOW | `mapReason` collapses every unmapped run reason to `unreachable`, so wireless `no-association`, DHCP relay failures, etc. surface as "destination host unreachable". | `SimulationFlows.ts:699–717` | Extend the switch with the remaining `dropReasons.ts` codes. |
| C-4 | INFO | Reported RTT is `2 × sum(link propagation latency)` only — transmission/queue/processing delay excluded (documented as estimate). | `SimulationFlows.ts:135–144` | Fine for a lab sim; consider adding link utilization component. |

---

## Dimension 2 — ARCHITECTURE (9/10)

- **Single-owner state model** is explicit and enforced by module headers:
  - `SimulationContext` — scheduler, bus, virtual clock, topology, nodes, processors, routing protocols
  - `SimulationCore` — event log, seq/pkt counters, ARP buffers, packet pipeline
  - `RunManager` — runs/runSeq, event dispatch, AGING (`RunManager.ts:1–11`)
  - `ConfigStore` — sole owner of all 30+ configuration maps (configs, VLAN/trunk, ACL/NAT, DHCP pools, DNS, STP, FHRP, QoS, port-security, SLAAC, wireless…)
- **`NetworkSimulator` facade** keeps the legacy `SimulationEngine` API (`net/index.ts:7`), so `App.tsx` swapped imports without rewrites — a pragmatic, verifiable migration strategy.
- **DI via constructor injection** throughout (`SimulationFlows` takes ctx/core/runManager/configStore/observation; `RunManager` takes ctx/core) — no service-locator patterns.
- **`EventBus`** is a minimal, correct pub/sub: unsubscribe is the returned closure (`Set.delete`), `clear()` provided; Set iteration tolerates unsubscribe-during-emit.
- Deliberate trade-off: `ConfigStore` is a large bag of maps (documented as "PEMILIK TUNGGAL"). Acceptable given the single-writer rule; a typed interface per config family would improve it further.

---

## Dimension 3 — ROBUSTNESS (7/10)

### Strong
- `linkLatencyMs`/`transmissionDelay` are null-safe (`Topology.ts:184–190`) — flows can't crash on dangling edge ids.
- `RunManager.processUntil` is bounded: `maxEvents = 500_000`, `maxTimeMs = 20_000` defaults, `status='fail' reason='timeout'` (`RunManager.ts:53–72`); SLAAC RS uses `maxEvents: 50` (`SimulationFlows.ts:282`). No infinite-loop risk from broadcast storms.
- ARP/NDP buffered frames are dropped with `arp-unresolved` after `ARP_RESOLVE_TIMEOUT_MS` — buffers cannot accumulate indefinitely (`RunManager.ts:133–149`).
- L2 broadcast loop guard `L2_MAX_HOPS = 24` (`SwitchProcessor.ts`); STP blocks ports via `isPortForwarding` in Switch/Wireless processors.
- Power-off mid-flight is handled at dispatch (`RunManager.ts:86–90`).
- Malformed-config guards: `parseCidr`/`parseIpv6Cidr` return null on bad prefix; `VlanTable` normalizes string ids, rejects out-of-range (`VLAN_ID_MIN/MAX`).

### Findings
| ID | Sev | Finding | Evidence | Suggestion |
|----|-----|---------|----------|------------|
| R-1 | MED | Event log is append-only and never capped within a session (only reset on topology sync). Long interactive sessions with many pings/traceroutes grow memory unboundedly; traceroute also slices the whole log per probe. | `SimulationFlows.ts:348, 372`; reset only in `TopologyRuntime.syncTopology` | Ring buffer or per-run retention window. |
| R-2 | LOW | `TimeManager.advance(deltaMs)` accepts negative delta — virtual clock can rewind. | `TimeManager.ts:21–23` | Guard `Math.max(0, …)` or clamp. |
| R-3 | LOW | `isValidIp` accepts leading zeros (`010.0.0.1`) — tolerated by browsers, rejected by real networking stacks. | `ip.ts:5–9` (`/^\d{1,3}$/`) | Reject `^0\d` octets. |
| R-4 | LOW | `maskToPrefix` counts only leading 1-bits, so non-contiguous masks (e.g. `255.255.0.1`) silently map to a shorter prefix instead of being rejected. | `ip.ts:24–32` | Verify contiguity; return error/null. |
| R-5 | LOW | `EventScheduler` tie-break compares string ids `evt-<at>-<seq>` lexicographically: at equal virtual time, `evt-0-10` sorts before `evt-0-2` — deterministic but not insertion-ordered once seq ≥ 10. | `EventScheduler.ts:13, 40–43` | Zero-pad seq in id. |

---

## Dimension 4 — PERFORMANCE (8/10)

- `EventScheduler` is a true binary min-heap — O(log n) push/pop (`EventScheduler.ts`).
- L2 broadcast bounded (L2_MAX_HOPS), STP blocks loops; aging runs on a 5 s virtual cadence (`RunManager.ts:151–152`).
- Caches are pruned: MAC/ARP/NDP aging, DNS cache TTL expiry, DHCP lease expiry, NAT session prune (`RunManager.ts:113–132`; `Nat.ts` `SESSION_TTL_MS`).
- `RoutingTable` LPM with metric tie-break and dedupe — sub-linear per look-up in practice.
- Minor: `deviceByName`/`deviceByIp` are O(n) scans per ping/flow (`SimulationFlows.ts:160–173`), `computeWireless` is O(L) on every topology sync (`WirelessService.ts:74–78`), `rttOf` O(hops). All acceptable at lab scale (dozens of nodes); flag only if scaling to hundreds.

---

## Dimension 5 — MAINTAINABILITY (7/10)

- Excellent: every module opens with an ownership/behavior contract (Indonesian), named constants instead of magic numbers (DNS_CACHE_TTL_MS, SESSION_TTL_MS, LEASE_DURATION_MS, L2_MAX_HOPS, MAX_HOPS=16, AGING interval), and `file:line`-style rationale comments for past bugs (e.g., `networkOf` signed-int pitfall, `defaultPortMac` FNV fix, `MacTable` `null→1` key rationale).
- Findings:
| ID | Sev | Finding | Evidence | Suggestion |
|----|-----|---------|----------|------------|
| M-1 | MED | `simulateTraceroute` and `simulateTraceroute6` are ~60 near-identical lines; ping4/ping6 share the same shape. Bug fixes must be applied twice. | `SimulationFlows.ts:321–398` vs `401–462` | Generic probe walker parameterized by address family. |
| M-2 | LOW | `run_all_tests.mts` is a 3883-line monolith (though it *does* delegate to modular `tests/unit/*` suites — structure is salvageable). | `run_all_tests.mts` | Keep suites modular; shrink the runner to orchestration only. |
| M-3 | LOW | Dead branch `'01:00:5e'` in `EthernetFrame.isMulticastMac` (IPv4 multicast MAC prefix is `01:00:5e`, but function is IPv6-oriented). | `layer2/EthernetFrame.ts` | Remove or document. |
| M-4 | INFO | Mixed-language comments (Indonesian narrative, English identifiers) — consistent within modules, fine for a localized project. | — | Keep one language per file. |

---

## Dimension 6 — TESTABILITY (9/10)

- Pure, exported helpers: `ip.ts`, `ipv6.ts`, `dropReasons.ts`, `MacTable`, `VlanTable`, `RoutingTable`, `Icmp` builders, `NatTranslator`, `formatPing`, `computeWireless`, `computeFhrp`, `isValidVlanId`, `parseRate`, `compareOid`, `topologyReducer`, `generateMac` — all unit-testable without simulation context.
- Deterministic virtual clock + seeded MACs + deterministic drop reasons make scenarios reproducible; `lab/scenarios.ts` uses real engine assertions (`assertPing`, `assertVlanReachability`, `assertBgp`) with per-scenario node/port/edge builders.
- Test evidence: 2162 assertions green across vendor interop, protocol fidelity, data-plane, services, CLI facade, port inspector, AI agent suites.
- Gap: `InteractionEngine.ts` (gesture state machine) and `TopologyState` reducer have no direct unit tests found; gesture logic (multi-touch, cable drag) would benefit.

---

## Dimension 7 — STATE CONSISTENCY (8/10)

- Strongest property of the engine: **one owner per state slice** (see Dimension 2). No evidence of parallel copies of config or run state.
- Per-session hygiene in `TopologyRuntime.syncTopology`: scheduler/bus/time/runs/event log reset, `ifaceCounters`/`fragBuffer` cleared per device.
- Virtual clock is the single time source; all caches keyed to `ctx.time.now()` (DNS `expiresAt`, lease `expiresAt`, NAT `lastUsed`).
- `failRunIfRoot` only marks the *root* run — child protocol events can't corrupt parent status (`RunManager.ts:41–47`).
- Findings:
| ID | Sev | Finding | Evidence | Suggestion |
|----|-----|---------|----------|------------|
| S-1 | LOW | SLAAC address exists in two places (`iface.ipv6` via `setIpv6ByName` and `dev.slaacAddresses[name]`) — divergence risk if one path is updated without the other. | `RouterProcessor.ts:484–485`; `NetworkDevice.ts:305–314` | Make `slaacAddresses` a read-through view of `iface.ipv6`. |
| S-2 | LOW | `RunManager.getRun` auto-creates runs on read — implicit state mutation from a getter; callers relying on "does not exist → null" semantics would be misled. | `RunManager.ts:31–35` | Split `getRun` (read-only) from `ensureRun`. |
| S-3 | INFO | ARP buffers keyed `"devId|…"` are parsed by splitting on `|` — fragile if a device id ever contains `|`. | `RunManager.ts:137–138` | Use structured keys. |

---

## Confirmed Non-Issues (checked, OK)
- SLAAC RS→RA→EUI-64→default-route chain consistent end-to-end (see D1).
- Ping self-destination handled; ARP-self dead-end avoided (`SimulationFlows.ts:633`).
- Scheduler loop cannot hang (`processUntil` budget, ARP-buffer timeout, aging reschedule).
- Link helpers null-safe; no crash path on dangling topology.
- `networkOf` unsigned math correct (documented pitfall fixed).
- DHCP renew (T1) and release flows implemented with real packets (`simulateDhcpRenew`, `simulateDhcpRelease`, `SimulationFlows.ts:77–108`).
- Firewall ACL out-interface rules only fire when out-interface is known (`FirewallService.aclBlocks`).

---

## Summary of Actionable Items
1. **Fix IPv6 parser strictness** (C-1) — highest-value, low-effort.
2. **Cap event log** (R-1).
3. **De-duplicate v4/v6 flow code** (M-1).
4. **Deterministic packet ids** (C-2).
5. Small hardening: `maskToPrefix` contiguity (R-4), leading-zero octets (R-3), scheduler id padding (R-5), `mapReason` coverage (C-3), `advance` clamp (R-2).

*No CRITICAL or HIGH issues confirmed; the engine is safe to ship as-is, with the recommendations above as incremental improvements.*
