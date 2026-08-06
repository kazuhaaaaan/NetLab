// ============================================================
// LearningEngine — mengatur progresi belajar:
// bila user belum paham → mode learn (bimbingan),
// bila sudah mencoba dan masih gagal → mode hint (petunjuk bertahap),
// bila sudah mencoba banyak → mode diagnose (solusi).
// ============================================================

import { NetworkStateReader } from './NetworkStateReader';
import { HintEngine } from './HintEngine';
import { LearnEngine } from './LearnEngine';
import { DiagnoseEngine } from './DiagnoseEngine';
import { MentorResponse } from './types';

export type LearningMode = 'learn' | 'hint' | 'diagnose';

interface Session {
  mode: LearningMode;
  attempts: number;
  topics: Set<string>;
}

export class LearningEngine {
  private sessions = new Map<string, Session>();
  private hint: HintEngine;
  private learn: LearnEngine;

  constructor(private reader: NetworkStateReader, private diagnose: DiagnoseEngine) {
    this.hint = new HintEngine(reader);
    this.learn = new LearnEngine(reader);
  }

  /** Catat satu percobaan user pada topik; menaikkan tingkat bantuan. */
  recordAttempt(topic: string, success: boolean): void {
    const s = this.session(topic);
    if (success) {
      s.attempts = 0;
      s.mode = 'learn';
      this.hint.reset(topic);
    } else {
      s.attempts += 1;
      if (s.attempts >= 2) s.mode = 'hint';
      if (s.attempts >= 4) s.mode = 'diagnose';
    }
  }

  /** Langkah berikutnya sesuai level bantuan user. */
  next(topic: string): MentorResponse {
    const s = this.session(topic);
    switch (s.mode) {
      case 'diagnose':
        return this.diagnoseTopic(topic);
      case 'hint':
        return this.hint.next(topic);
      default:
        return this.learn.guide(topic);
    }
  }

  /** Level bantuan yang sedang aktif. */
  mode(topic: string): LearningMode {
    return this.session(topic).mode;
  }

  private session(topic: string): Session {
    let s = this.sessions.get(topic);
    if (!s) {
      s = { mode: 'learn', attempts: 0, topics: new Set() };
      this.sessions.set(topic, s);
    }
    return s;
  }

  private diagnoseTopic(topic: string): MentorResponse {
    const res = this.diagnose.diagnose({});
    const t = topic.toLowerCase();
    const filter = (i: { category: string }) =>
      t.includes('dhcp') ? i.category === 'dhcp' :
      t.includes('nat') ? i.category === 'nat' :
      t.includes('routing') || t.includes('route') ? i.category === 'routing' :
      t.includes('dns') ? i.category === 'dns' :
      t.includes('vlan') ? i.category === 'vlan' :
      t.includes('firewall') || t.includes('acl') ? i.category === 'firewall' :
      t.includes('switch') || t.includes('mac') ? i.category === 'switch' : true;
    const issues = res.issues.filter(filter);
    return {
      mode: 'diagnose',
      status: issues.some((i) => i.severity !== 'info') ? 'problem' : 'healthy',
      title: `Diagnosis: ${topic}`,
      sections: [
        ...(issues.length === 0
          ? [{ heading: 'Hasil', lines: ['Tidak ditemukan masalah pada kategori ini.'] }]
          : issues.map((i) => ({
              heading: `${i.severity.toUpperCase()} · ${i.affectedDeviceName ?? i.affectedDeviceId ?? ''}`,
              lines: [i.title, ...i.evidence, `(confidence ${i.confidence})`],
            }))),
      ],
      commands: issues.flatMap((i) => i.commands),
      confidence: res.confidence,
    };
  }
}
