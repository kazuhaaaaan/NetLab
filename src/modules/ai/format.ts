// ============================================================
// format — render hasil AI Mentor ke format terstruktur:
// Status / Root Cause / Evidence / Affected Device / Recommendation
// / Command / Confidence, plus visual packet path.
// ============================================================

import { AnalysisResult, CommandSuggestion, MentorResponse, VendorId } from './types';

const SEP = '━━━━━━━━━━━━━━━━━━━━';

function block(heading: string, lines: string[]): string {
  const content = lines.length > 0 ? lines.join('\n') : '—';
  return [SEP, heading, '', content].join('\n');
}

export function renderPacketPath(path: string[]): string {
  if (path.length === 0) return '(tanpa path)';
  return path.map((n, i) => `${i === path.length - 1 ? n : `${n}\n↓`}`).join('\n');
}

export function renderCommands(cmds: CommandSuggestion[]): string {
  if (cmds.length === 0) return '';
  const parts = cmds.map((c) => `[${c.vendor}]\n${c.commands.join('\n')}`);
  return parts.join('\n\n');
}

function statusEmoji(status: 'healthy' | 'problem' | 'info'): string {
  if (status === 'healthy') return '🟢 Healthy';
  if (status === 'problem') return '🔴 Problem Detected';
  return 'ℹ️ Info';
}

/** Render MentorResponse (diagnose/fix/hint/learn/explain) ke teks box. */
export function renderResponse(res: MentorResponse): string {
  const out: string[] = [];
  out.push(block('Status', [statusEmoji(res.status)]));
  for (const s of res.sections) {
    out.push(block(s.heading, s.lines));
  }
  if (res.packetPath && res.packetPath.length > 0) {
    out.push(block('Packet Path', renderPacketPath(res.packetPath).split('\n')));
  }
  const cmds = renderCommands(res.commands);
  if (cmds) out.push(block('Command', cmds.split('\n')));
  out.push(block('Confidence', [`${Math.round(res.confidence * 100)}%`]));
  if (res.note) out.push(block('Note', [res.note]));
  return out.join('\n');
}

/** Render AnalysisResult (diagnose penuh) dengan checklist kategori. */
export function renderDiagnosis(res: AnalysisResult): string {
  const out: string[] = [];

  out.push(block('Status', [res.status === 'healthy' ? '🟢 Healthy' : '🔴 Problem Detected']));

  const checks = res.checks.map((c) => `${c.ok ? '✔' : '✗'} ${c.label}: ${c.detail}`);
  out.push(block('Checks', checks));

  const problems = res.issues.filter((i) => i.severity !== 'info');
  if (problems.length > 0) {
    out.push(block('Root Cause', problems.map((i) => `- ${i.title}: ${i.rootCause}`)));
    const evidence = dedupe(problems.flatMap((i) => i.evidence));
    out.push(block('Evidence', evidence.map((e) => `- ${e}`)));
    const affected = dedupe(
      problems
        .filter((i) => i.affectedDeviceName)
        .map((i) => `${i.affectedDeviceName}${i.ifaceName ? ` (Interface ${i.ifaceName})` : ''}`)
    );
    out.push(block('Affected Device', affected.map((a) => `- ${a}`)));
    out.push(block('Recommendation', problems.map((i) => `- ${i.recommendation}`)));
  } else {
    out.push(block('Root Cause', ['Tidak ditemukan masalah signifikan.']));
    out.push(block('Evidence', ['Semua pemeriksaan lintas kategori lolos.']));
    out.push(block('Affected Device', ['—']));
    out.push(block('Recommendation', ['Tidak ada tindakan diperlukan.']));
  }

  const allCmds = dedupeCommands(
    res.issues.flatMap((i) => i.commands),
    res.issues
  );
  const cmds = renderCommands(allCmds);
  if (cmds) out.push(block('Command', cmds.split('\n')));

  for (const p of res.probePaths) {
    out.push(
      block(
        `Packet Path (${p.from} → ${p.to})`,
        p.ok
          ? renderPacketPath(p.path).split('\n')
          : [`GAGAL: ${p.reason ?? 'unreachable'}${p.path.length ? '' : ''}`, ...renderPacketPath(p.path).split('\n')]
      )
    );
  }

  out.push(block('Confidence', [`${Math.round(res.confidence * 100)}%`]));
  if (res.note) out.push(block('Note', [res.note]));
  return out.join('\n');
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/** Gabung command per vendor; pasang command hanya dari issue fixable. */
function dedupeCommands(cmds: CommandSuggestion[], issues: AnalysisResult['issues']): CommandSuggestion[] {
  const byVendor = new Map<VendorId, string[]>();
  for (const c of cmds) {
    const list = byVendor.get(c.vendor) ?? [];
    list.push(...c.commands);
    byVendor.set(c.vendor, list);
  }
  if (issues.some((i) => i.severity !== 'info' && i.fixKey)) {
    return [...byVendor.entries()].map(([vendor, commands]) => ({ vendor, commands: dedupe(commands) }));
  }
  return [];
}
