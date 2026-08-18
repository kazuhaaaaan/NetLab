// ============================================================
// transaction — snapshot & rollback untuk eksekusi Action Plan.
//
// Konsep:
//   - Sebelum eksekusi: capture snapshot { project clone,
//     serialized vendor memory }.
//   - Setiap action yang gagal verifikasi → rollback ke snapshot.
//   - Rollback = restore memori vendor + applyProject + resync
//     engine + bersihkan verifikasi action yang dibatalkan.
//
// Sumber kebenaran: proyek + memori CLI (engine selalu diturunkan
// dari keduanya), sehingga snapshot dua-duanya cukup.
// ============================================================

import type { LabProject } from '../../../types';
import type { AgentRuntime } from './runtime';
import { cloneProject } from './runtime';
import type { VerificationEngine } from './verification';

export interface Snapshot {
  project: LabProject | null;
  memory: Record<string, unknown>;
}

/** Ambil snapshot sebelum mutasi. */
export function captureSnapshot(runtime: AgentRuntime): Snapshot {
  return {
    project: runtime.getProject() ? cloneProject(runtime.getProject() as LabProject) : null,
    memory: runtime.dispatcher.serializeMemory() as unknown as Record<string, unknown>,
  };
}

/** Pulihkan snapshot (proyek + memori + resync engine). */
export function restoreSnapshot(runtime: AgentRuntime, snap: Snapshot): boolean {
  try {
    runtime.dispatcher.restoreMemory(snap.memory);
    if (snap.project) {
      runtime.applyProject(cloneProject(snap.project));
      for (const n of snap.project.nodes) {
        runtime.syncNodeToEngine(n.id);
      }
      runtime.syncDhcpPools();
    }
    runtime.persistMemory();
    return true;
  } catch {
    return false;
  }
}

/** Batasi verifikasi hanya action pada plan ini. */
export function verificationScope(verification: VerificationEngine, actionId: string) {
  return {
    clear: () => verification.clearForAction(actionId),
  };
}

/** Kelas transaksi: mulai → eksekusi → commit/rollback. */
export class Transaction {
  private snap: Snapshot | null = null;
  private started = false;

  constructor(
    private runtime: AgentRuntime,
    private verification: VerificationEngine
  ) {}

  begin(): boolean {
    if (this.started) return false;
    this.snap = captureSnapshot(this.runtime);
    this.started = true;
    return true;
  }

  /** Rollback semua perubahan transaksi ini. */
  rollback(): boolean {
    if (!this.started || !this.snap) return false;
    const ok = restoreSnapshot(this.runtime, this.snap);
    this.started = false;
    this.snap = null;
    return ok;
  }

  /** Commit: snapshot dibuang, perubahan dipertahankan. */
  commit(): void {
    this.started = false;
    this.snap = null;
  }

  get active(): boolean {
    return this.started;
  }
}