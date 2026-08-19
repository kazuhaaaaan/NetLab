// ============================================================
// format — render hasil agent untuk chat/UI.
//
// Struktur output konsisten dengan Prompt AI Agent:
//   - plan preview (daftar aksi + expected effect)
//   - execute outcome (aksi, verifikasi, rollback)
//   - diagnostic (root cause, packet trace, fix)
// Semua berbasis data terstruktur — bukan klaim teks bebas.
// ============================================================

import type { ActionPlan, ExecuteOutcome, DiagnosticResult, VerificationResult } from './types';

const RISK_ICON: Record<string, string> = { low: '●', medium: '◆', high: '▲' };

/** Ringkasan satu verifikasi untuk narasi chat. */
export function formatVerification(vr: VerificationResult): string {
  const parts = [
    `[${vr.testType}]`,
    vr.success ? 'OK' : 'GAGAL',
    vr.source ? vr.source : '',
    vr.destination ? `→ ${vr.destination}` : '',
  ];
  if (vr.reason) parts.push(`(${vr.reason})`);
  if (vr.packetLoss != null && vr.packetLoss > 0) parts.push(`loss=${vr.packetLoss}%`);
  if (vr.latency?.avg != null) parts.push(`rtt=${vr.latency.avg}ms`);
  return parts.join(' ');
}

/** Preview rencana — dipakai sebelum eksekusi (mode propose). */
export function formatPlanPreview(plan: ActionPlan): string {
  const lines: string[] = [
    `AI ACTION PLAN — ${plan.goal}`,
    `Mode: ${plan.mode} · ${plan.actions.length} aksi`,
    '',
  ];
  for (const [i, a] of plan.actions.entries()) {
    lines.push(
      `${i + 1}. [${a.type}] ${a.target ? `${a.target} ` : ''}${RISK_ICON[a.risk] ?? ''}`,
      `   alasan: ${a.reason}`,
      `   efek:   ${a.expectedEffect}`
    );
  }
  return lines.join('\n');
}

/** Hasil eksekusi plan — aksi + verifikasi + rollback. */
export function formatExecuteOutcome(out: ExecuteOutcome): string {
  const lines: string[] = [
    out.ok ? 'PLAN SUKSES' : out.rolledBack ? 'PLAN GAGAL — ROLLBACK' : 'PLAN GAGAL',
    out.message,
    '',
  ];
  for (const r of out.results) {
    const icon = r.ok ? '✓' : '✗';
    lines.push(`${icon} [${r.type}] ${r.ok ? 'OK' : r.message}`);
    if (r.verification) lines.push(`   verify: ${formatVerification(r.verification)}`);
    if (r.rolledBack) lines.push('   (di-rollback)');
  }
  if (out.verifications.length > 0) {
    lines.push('');
    lines.push(`Verifikasi: ${out.verifiedCount}/${out.verifications.length} sukses`);
  }
  return lines.join('\n');
}

/** Hasil diagnosa koneksi — root cause + bukti + packet trace. */
export function formatDiagnostic(diag: DiagnosticResult): string {
  const lines: string[] = [
    `DIAGNOSA ${diag.sourceName} → ${diag.destinationIp}`,
    diag.ok ? 'Koneksi BERHASIL.' : `ROOT CAUSE: ${diag.rootCause ?? 'tidak diketahui'}`,
    '',
  ];
  for (const e of diag.evidence) {
    lines.push(`— ${e.step}:`);
    for (const d of e.data.slice(0, 8)) lines.push(`   ${d}`);
  }
  if (diag.packetTrace.length > 0) {
    lines.push('— packet trace:');
    for (const h of diag.packetTrace) lines.push(`   ${h}`);
  }
  if (diag.recommendedFixes.length > 0) {
    lines.push('— perbaikan yang disarankan:');
    for (const f of diag.recommendedFixes) {
      lines.push(`   ${f.type} ${f.target ?? ''} (${f.expectedEffect})`);
    }
  }
  return lines.join('\n');
}

/** Daftar riwayat verifikasi (Configuration → Verification → Fix → Verify). */
export function formatVerificationHistory(entries: Array<{ id: string; label: string; timestamp: number; success: boolean; testType: string }>): string {
  const lines = ['RIWAYAT VERIFIKASI'];
  for (const h of entries.slice(-20)) {
    lines.push(`${h.success ? '✓' : '✗'} ${h.label}`);
  }
  return lines.join('\n');
}