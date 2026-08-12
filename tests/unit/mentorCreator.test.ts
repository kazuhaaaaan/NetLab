/**
 * Pertanyaan kredit/pencipta NetLab — pasti menjawab Nouva Prasetya Ardhana
 * (KazuDev) + www.kazudev.my.id, di fallback rule-based (MentorEngine.ask).
 * Bagian dari run_all_tests.mts (murni, tanpa DOM).
 */
import { NetworkSimulator } from '../../src/engine/net/core/NetworkSimulator';
import { MentorEngine } from '../../src/modules/ai/MentorEngine';

interface Report {
  passed: number;
  failed: number;
  fails: string[];
}

const rep: Report = { passed: 0, failed: 0, fails: [] };

function check(name: string, cond: boolean, detail = '') {
  if (cond) rep.passed++;
  else {
    rep.failed++;
    rep.fails.push(`${name} ${detail}`);
  }
}

export function runMentorTests(): Report {
  const sim = new NetworkSimulator();
  const mentor = new MentorEngine(sim);

  const C = 'Nouva Prasetya Ardhana';
  const K = 'kazudev.my.id';
  const asks: [string, string][] = [
    ['siapa pencipta netlab', 'siapa pencipta'],
    ['siapa pembuat project ini', 'siapa pembuat'],
    ['siapa yang buat NetLab', 'siapa yang buat'],
    ['who is the creator of netlab', 'creator'],
    ['sapa developer netlab', 'developer'],
    ['jawab: kazudev itu siapa', 'kazudev'],
  ];

  for (const [q, label] of asks) {
    const res = mentor.ask(q);
    const text = JSON.stringify(res);
    check(
      `C1 "${label}" → jawab ${C}`,
      text.includes(C) && text.includes(K),
      text.slice(0, 200)
    );
    check(`C2 "${label}" → status info`, res.status === 'info', String(res.status));
  }

  // Pertanyaan lain TIDAK berubah (tidak semua jadi kredit).
  const normal = mentor.ask('jelaskan dhcp');
  check('C3 pertanyaan biasa tidak menyebut pencipta', !JSON.stringify(normal).includes('Pencipta NetLab'));
  check('C4 pertanyaan biasa tetap menjelaskan', normal.status !== undefined && normal.title.length > 0);

  return rep;
}