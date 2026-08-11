import { Reveal, SectionHeading } from './shared';

const BLOCKS = [
  {
    vendor: 'MikroTik RouterOS',
    prompt: '[admin@MikroTik] >',
    lines: [
      { text: '/ip route print', tone: 'cmd' },
      { text: 'Flags: X - disabled, A - active, D - dynamic, C - connect, S - static', tone: 'dim' },
      { text: ' #   DST-ADDRESS        GATEWAY', tone: 'dim' },
      { text: ' 0 A S 0.0.0.0/0        10.0.0.2', tone: 'ok' },
      { text: ' 1   C 10.0.0.0/30      ether1', tone: 'std' },
    ],
  },
  {
    vendor: 'Cisco IOS',
    prompt: 'R1#',
    lines: [
      { text: 'show ip route', tone: 'cmd' },
      { text: 'Codes: C - connected, S - static, O - OSPF, B - BGP ...', tone: 'dim' },
      { text: 'Gateway of last resort is 10.0.0.2 to network 0.0.0.0', tone: 'dim' },
      { text: 'S*   0.0.0.0/0 [1/0] via 10.0.0.2', tone: 'ok' },
      { text: 'C    10.0.0.0/30 is directly connected, GigabitEthernet0/0', tone: 'std' },
    ],
  },
  {
    vendor: 'Juniper JunOS',
    prompt: 'admin@JunOS>',
    lines: [
      { text: 'show route 0.0.0.0/0', tone: 'cmd' },
      { text: 'inet.0: 3 destinations, 3 routes (3 active, 0 holddown)', tone: 'dim' },
      { text: '0.0.0.0/0', tone: 'std' },
      { text: "            *[Static/5] 00:12:42, metric2 0", tone: 'ok' },
      { text: '               via ge-0/0/0.0', tone: 'std' },
    ],
  },
];

const TONE_CLASS: Record<string, string> = {
  cmd: 'text-emerald-300',
  ok: 'text-emerald-400/90',
  std: 'text-slate-300',
  dim: 'text-slate-500',
};

export function CliPreview() {
  return (
    <section id="cli" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="cli preview"
            title="Not a diagram tool — a real CLI, per device."
            description="Every node has its own terminal with authentic vendor syntax. The same commands you'd type on hardware, with simulated state behind them."
          />
        </Reveal>

        <div className="mt-12 grid lg:grid-cols-3 gap-4">
          {BLOCKS.map((block, i) => (
            <Reveal key={block.vendor} delay={i * 90}>
              <div className="h-full overflow-hidden rounded-xl border border-[#1F2128] bg-[#0B0C0E]">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1F2128]">
                  <span className="w-2 h-2 rounded-full bg-[#3d3f45]" aria-hidden="true" />
                  <span className="w-2 h-2 rounded-full bg-[#3d3f45]" aria-hidden="true" />
                  <span className="w-2 h-2 rounded-full bg-[#3d3f45]" aria-hidden="true" />
                  <span className="ml-2 text-[11px] font-mono text-slate-500 truncate">{block.vendor}</span>
                </div>
                <div className="p-4 font-mono text-[11px] leading-relaxed">
                  <div className="text-emerald-400">
                    {block.prompt} <span className="text-slate-200">{block.lines[0].text}</span>
                  </div>
                  {block.lines.slice(1).map((l, j) => (
                    <div key={j} className={`mt-1 pl-3 whitespace-pre-wrap break-all ${TONE_CLASS[l.tone]}`}>
                      {l.text}
                    </div>
                  ))}
                  {i === 1 && (
                    <div className="mt-1 pl-3 text-emerald-400">
                      R1# <span className="inline-block w-1.5 h-3 bg-slate-300 align-middle" style={{ animation: 'netlab-blink 1s steps(2) infinite' }} />
                    </div>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}