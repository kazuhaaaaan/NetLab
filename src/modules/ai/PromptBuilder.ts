// ============================================================
// PromptBuilder — membangun "konteks" & prompt berbasis state.
// Digunakan untuk: output ringkas ke UI, dan (opsional) sebagai
// konteks bila AI eksternal dimanfaatkan nanti.
// ============================================================

import { NetworkStateReader } from './NetworkStateReader';
import { AnalysisResult, MentorResponse, NetworkState } from './types';

export type PromptIntent = 'diagnose' | 'explain' | 'fix' | 'learn' | 'summary';

export class PromptBuilder {
  constructor(private reader: NetworkStateReader) {}

  /** Snapshot jaringan menjadi teks yang bisa dibaca manusia/LLM. */
  buildContext(state: NetworkState): string {
    const lines: string[] = [];
    lines.push(`Topologi: ${state.devices.length} perangkat, ${state.links.length} kabel (t=${state.now}).`);
    for (const d of state.devices) {
      lines.push(`- [${d.vendor}] ${d.name} (${d.deviceType}) ${d.powered ? 'ON' : 'OFF'}${d.ip ? ` ip=${d.ip}` : ''}`);
      for (const i of d.interfaces) {
        const flag = !i.up ? 'DOWN' : i.shutdown ? 'SHUTDOWN' : 'up';
        lines.push(`    ${i.name}: ${i.ip ?? '-'} ${flag}${i.cable ? ' cable' : ''}`);
      }
      if (d.routes.length) lines.push(`    routes: ${d.routes.map((r) => `${r.dst}->${r.gateway ?? '-'}`).join(', ')}`);
      if (d.acls.length) lines.push(`    firewall: ${d.acls.length} rule`);
      if (d.natRules.length) lines.push(`    nat: ${d.natRules.length} rule`);
      if (d.leases.length) lines.push(`    lease: ${d.leases.map((l) => `${l.iface}=${l.ip}`).join(', ')}`);
    }
    return lines.join('\n');
  }

  /** Prompt siap pakai untuk sebuah maksud. */
  buildPrompt(intent: PromptIntent, extra?: string): string {
    const state = this.reader.read();
    const ctx = this.buildContext(state);
    switch (intent) {
      case 'diagnose':
        return `Lakukan diagnosis jaringan berikut.\n\n${ctx}\n\n${extra ?? ''}\nBerikan daftar masalah dengan root cause.`;
      case 'explain':
        return `Jelaskan perilaku jaringan berikut berdasarkan data.\n\n${ctx}\n\n${extra ?? ''}`;
      case 'fix':
        return `Berdasarkan diagnosis berikut, berikan perintah perbaikan.\n\n${ctx}\n\n${extra ?? ''}`;
      case 'learn':
        return `Gunakan data berikut sebagai contoh untuk pembelajaran jaringan.\n\n${ctx}\n\n${extra ?? ''}`;
      case 'summary':
        return `Ringkas kondisi jaringan berikut.\n\n${ctx}`;
      default:
        return ctx;
    }
  }

  /** Render hasil analisis menjadi MentorResponse ringkas. */
  fromAnalysis(res: AnalysisResult): MentorResponse {
    return {
      mode: 'diagnose',
      status: res.status,
      title: res.status === 'healthy' ? 'Jaringan Sehat' : `Ditemukan ${res.issues.length} masalah`,
      sections: res.issues.map((i) => ({
        heading: `${i.severity.toUpperCase()} · ${i.affectedDeviceName ?? '? '}`,
        lines: [i.title, i.rootCause, ...i.evidence],
      })),
      commands: res.issues.flatMap((i) => i.commands),
      confidence: res.confidence,
      note: res.note,
    };
  }
}
