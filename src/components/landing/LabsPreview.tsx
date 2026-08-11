import { ArrowRight } from 'lucide-react';
import { PRESET_LABS } from '../../data/presetLabs';
import { Reveal, SectionHeading } from './shared';

const DIFFICULTY_STYLE: Record<string, string> = {
  Mudah: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  Sedang: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  Lanjut: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
};

interface LabsPreviewProps {
  onLaunch: () => void;
}

export function LabsPreview({ onLaunch }: LabsPreviewProps) {
  return (
    <section id="labs" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <SectionHeading
              eyebrow="ready-to-run labs"
              title="Practice with ready-to-run scenarios."
              description="The simulator ships with preset labs — gateway + DHCP, inter-VLAN routing, dual-ISP failover and an OSPF ring — each pre-wired with real device models."
            />
            <button
              onClick={onLaunch}
              className="group flex shrink-0 items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015] text-slate-200 text-sm font-medium px-5 py-2.5 transition-all duration-200 hover:border-sky-500/40 hover:bg-[#0F1015]"
            >
              Explore Labs
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </Reveal>

        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {PRESET_LABS.map((lab, i) => (
            <Reveal key={lab.id} delay={(i % 2) * 80}>
              <div className="h-full rounded-xl border border-[#1F2128] bg-[#0F1015] p-6 transition-all duration-200 hover:border-slate-600/60">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">{lab.title}</h3>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${DIFFICULTY_STYLE[lab.difficulty] || ''}`}>
                    {lab.difficulty}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-slate-400 leading-relaxed">{lab.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lab.features.map((f) => (
                    <span key={f} className="rounded-md border border-[#1F2128] bg-[#0B0C0E] px-2 py-0.5 text-[10.5px] font-mono text-slate-400">
                      {f}
                    </span>
                  ))}
                </div>
                <div className="mt-4 border-t border-[#1F2128] pt-3 font-mono text-[10.5px] text-slate-500">
                  {lab.topologySummary}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}