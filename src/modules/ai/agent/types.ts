// ============================================================
// AI Network Agent — tipe inti.
//
// Arsitektur:
//   AI (pengguna/LLM) → Tool Call → Permission → Validation
//   → Transaction → Tool (engine/canvas) → Verification → Commit/Rollback
//
// Tidak ada jalur yang melewati tool: tidak ada akses langsung ke
// React state, tidak ada eval/exec, tidak ada bypass VendorDispatcher.
// ============================================================

import type { NetworkSimulator } from '../../../engine/net/core/NetworkSimulator';
import type { LabProject } from '../../../types';
import type { PingSimResult, TracerouteResult, TcpConnectResult } from '../../../engine/net/compat';

/** Mode izin AI — keamanan operasional. */
export type AiPermissionMode = 'read_only' | 'propose' | 'execute';

/** Kategori tool. */
export type AiToolKind = 'read' | 'topology' | 'config' | 'verification' | 'diagnostic' | 'lab';

/** Hasil eksekusi satu tool (structured; tanpa `any`). */
export interface ToolResult {
  ok: boolean;
  /** payload hasil — selalu objek yang bisa diserialisasi (bukan class/Map). */
  data?: Record<string, unknown>;
  error?: string;
  /** pesan ringkas untuk narasi AI. */
  message: string;
  /** bukti pendukung (list string). */
  evidence?: string[];
  /** true bila command tidak didukung vendor/engine. */
  unsupported?: boolean;
}

/** Validasi input tool — hasil structured. */
export interface ToolValidation {
  ok: boolean;
  errors: string[];
  params: Record<string, unknown>;
}

/** Definisi tool — satu entri registry. */
export interface ToolDef {
  name: string;
  description: string;
  kind: AiToolKind;
  /** mode minimum yang diizinkan untuk MENJALANKAN mutasi. */
  permission: AiPermissionMode;
  /** true bila tool mengubah state (topologi/konfigurasi). */
  mutating: boolean;
  /** parameter yang didukung (nama → deskripsi). */
  params: Record<string, string>;
  /** validasi + eksekusi. */
  execute: (params: Record<string, unknown>, ctx: ToolExecCtx) => ToolResult;
}

/** Konteks eksekusi tool. */
export interface ToolExecCtx {
  runtime: import('./runtime').AgentRuntime;
  verification: import('./verification').VerificationEngine;
  /** id action plan saat ini (untuk jejak verifikasi). */
  actionId?: string;
  /** alasan pemanggilan tool (narasi). */
  reason?: string;
}

// ── Action Plan ───────────────────────────────────────────────

export type PlanActionType =
  | 'create_device'
  | 'delete_device'
  | 'rename_device'
  | 'move_device'
  | 'connect_devices'
  | 'disconnect_devices'
  | 'execute_cli'
  | 'configure_ip_address'
  | 'remove_ip_address'
  | 'configure_route'
  | 'configure_vlan'
  | 'configure_trunk'
  | 'configure_ospf'
  | 'configure_bgp'
  | 'configure_dhcp'
  | 'configure_nat'
  | 'configure_firewall'
  | 'configure_wireless'
  | 'verify'
  | 'diagnose'
  | 'lab';

export interface PlanAction {
  id: string;
  type: PlanActionType;
  /** perangkat/objek sasaran (nama node, IP, dst). */
  target?: string;
  params: Record<string, unknown>;
  /** alasan mengapa action ini dilakukan. */
  reason: string;
  /** efek yang diharapkan (diverifikasi setelah eksekusi). */
  expectedEffect: string;
  /** tingkat risiko: low/medium/high. */
  risk: 'low' | 'medium' | 'high';
  /** deskripsi validasi. */
  validation: string;
}

export interface ActionPlan {
  id: string;
  goal: string;
  mode: AiPermissionMode;
  actions: PlanAction[];
}

/** Hasil eksekusi satu action. */
export interface PlanActionResult {
  actionId: string;
  type: PlanActionType;
  ok: boolean;
  message: string;
  verification?: VerificationResult;
  error?: string;
  rolledBack?: boolean;
}

/** Hasil keseluruhan eksekusi plan. */
export interface ExecuteOutcome {
  ok: boolean;
  planId: string;
  goal: string;
  mode: AiPermissionMode;
  results: PlanActionResult[];
  verifications: VerificationResult[];
  rolledBack: boolean;
  message: string;
  /** jumlah action yang berhasil diverifikasi. */
  verifiedCount: number;
  failedCount: number;
}

/** Hasil planning (dari input natural language). */
export interface PlanOutcome {
  ok: boolean;
  intent: AiIntent;
  plan: ActionPlan | null;
  /** jawaban non-plan (learn/explain/diagnose) bila tidak perlu mutasi. */
  response?: string;
  message: string;
}

export type AiIntent =
  | 'lab_generation'
  | 'topology_creation'
  | 'configuration'
  | 'diagnosis'
  | 'fix'
  | 'verification'
  | 'explain'
  | 'learn'
  | 'unknown';

// ── Verification (shared engine) ──────────────────────────────

export type VerificationType =
  | 'ping'
  | 'ping6'
  | 'traceroute'
  | 'tcp'
  | 'route'
  | 'arp'
  | 'ndp'
  | 'ospf'
  | 'bgp'
  | 'eigrp'
  | 'vlan'
  | 'dhcp'
  | 'nat'
  | 'firewall'
  | 'wireless'
  | 'topology'
  | 'interface';

/** Hasil verifikasi terstruktur — dipakai AI, grading, dan diagnostik. */
export interface VerificationResult {
  success: boolean;
  testType: VerificationType;
  /** sumber (nama device atau id). */
  source?: string;
  /** tujuan (nama device / IP). */
  destination?: string;
  packetsSent?: number;
  packetsReceived?: number;
  packetLoss?: number;
  latency?: { min?: number; avg?: number; max?: number };
  hops?: string[];
  /** alasan gagal (mis. 'unreachable', 'no route to host'). */
  reason?: string;
  /** bukti detail (route/ARP/neighbor/dst.). */
  evidence: string[];
  /** detail kuantitatif tambahan. */
  detail?: Record<string, unknown>;
  /** actionId yang memicu verifikasi ini. */
  actionId?: string;
  /** timestamp ms. */
  timestamp: number;
}

/** Entri riwayat verifikasi (Configuration → Verification → Fix → Verify). */
export interface VerificationHistoryEntry extends VerificationResult {
  id: string;
  label: string;
}

// ── Lab generation ────────────────────────────────────────────

export interface LabTask {
  title: string;
  detail: string;
  /** deviceId → perintah CLI yang diharapkan (untuk panduan). */
  commands?: Record<string, string[]>;
}

export interface LabGradingCheckSpec {
  label: string;
  check: (sim: NetworkSimulator) => { pass: boolean; detail: string };
}

/** Hasil satu cek grading terhadap STATE NYATA engine. */
export interface LabGradingResult {
  label: string;
  pass: boolean;
  detail: string;
}

export interface GeneratedLab {
  id: string;
  name: string;
  description: string;
  /** perintah setup per device (dijalankan via execute_cli — jalur vendor). */
  setupCommands: Record<string, string[]>;
  tasks: LabTask[];
  expectedResults: string[];
  /** grading berbasis STATE NYATA engine (dipanggil dengan simulator + project
   *  untuk resolusi nama → id node, karena id engine berbentuk seeded uid). */
  grading: (sim: NetworkSimulator, project: LabProject) => LabGradingResult[];
}

// ── Diagnostic ────────────────────────────────────────────────

export interface DiagnosticEvidence {
  step: string;
  data: string[];
}

export interface DiagnosticResult {
  ok: boolean;
  sourceName: string;
  destinationIp: string;
  ping: VerificationResult;
  rootCause: string | null;
  evidence: DiagnosticEvidence[];
  packetTrace: string[];
  recommendedFixes: PlanAction[];
  message: string;
}

// ── Ping shared model ─────────────────────────────────────────

/** Konversi PingSimResult engine → VerificationResult (shared model). */
export function pingResultToVerification(
  r: PingSimResult,
  source: string,
  destination: string,
  testType: VerificationType = 'ping'
): VerificationResult {
  return {
    success: r.success,
    testType,
    source,
    destination,
    packetsSent: 1,
    packetsReceived: r.success ? 1 : 0,
    packetLoss: r.success ? 0 : 100,
    latency: r.rttMs != null ? { min: r.rttMs, avg: r.rttMs, max: r.rttMs } : undefined,
    hops: r.path.length > 0 ? r.path : undefined,
    reason: r.reason,
    evidence: r.path.length > 0 ? [`path: ${r.path.join(' → ')}`] : [],
    timestamp: Date.now(),
  };
}

/** Konversi TracerouteResult → VerificationResult. */
export function tracerouteToVerification(
  r: TracerouteResult,
  source: string,
  destination: string
): VerificationResult {
  return {
    success: r.ok,
    testType: 'traceroute',
    source,
    destination,
    hops: r.hops.map((h) => h.name),
    reason: r.ok ? undefined : r.reason,
    evidence: r.hops.map((h) => `hop ${h.ttl}: ${h.name}${h.ip ? ` (${h.ip})` : ''}`),
    timestamp: Date.now(),
  };
}

/** Konversi TcpConnectResult → VerificationResult. */
export function tcpToVerification(
  r: TcpConnectResult,
  source: string,
  destination: string,
  port: number
): VerificationResult {
  return {
    success: r.ok,
    testType: 'tcp',
    source,
    destination: `${destination}:${port}`,
    reason: r.ok ? undefined : r.reason,
    evidence: r.handshake.map((s) => `[${s.flags}] seq=${s.seq} ack=${s.ack}`),
    detail: r.status != null ? { status: r.status } : undefined,
    timestamp: Date.now(),
  };
}