import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { GITHUB_DOCS, Reveal } from './shared';

interface FinalCtaProps {
  onLaunch: () => void;
}

export function FinalCta({ onLaunch }: FinalCtaProps) {
  return (
    <section className="relative py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-[#1F2128] bg-[#0F1015] px-6 sm:px-12 py-12 sm:py-16 text-center">
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(ellipse 70% 90% at 50% 100%, black 30%, transparent 75%)',
                WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 50% 100%, black 30%, transparent 75%)',
              }}
            />
            <h2 className="relative text-3xl sm:text-[38px] font-bold tracking-[-0.03em] text-slate-50 leading-tight">
              Build your next network lab.
            </h2>
            <p className="relative mt-4 mx-auto max-w-xl text-sm sm:text-[15px] text-slate-400 leading-relaxed">
              Start experimenting in the browser — no accounts, no installs, no
              hardware. Design, configure and test in minutes.
            </p>
            <div className="relative mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={onLaunch}
                className="group flex items-center gap-2 rounded-lg bg-white text-slate-900 text-sm font-semibold px-6 py-3 transition-all duration-200 hover:bg-slate-200 active:scale-[0.98]"
              >
                Launch Simulator
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href={GITHUB_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0B0C0E]/60 text-slate-200 text-sm font-medium px-6 py-3 transition-all duration-200 hover:border-sky-500/40 hover:bg-[#0B0C0E]"
              >
                View Documentation
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}