import { ArrowDown, ArrowRight } from 'lucide-react';
import { ProductPreview } from './ProductPreview';
import { Reveal } from './shared';

interface HeroProps {
  onLaunch: () => void;
}

export function Hero({ onLaunch }: HeroProps) {
  return (
    <section id="top" className="relative overflow-hidden pb-16 sm:pb-24">
      {/* subtle grid, faded towards the bottom — no blobs, no glow */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 85% 55% at 50% 0%, black 30%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 55% at 50% 0%, black 30%, transparent 72%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-32 lg:pt-40">
        <div className="grid lg:grid-cols-[1.02fr_1fr] items-center gap-10 lg:gap-14">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1F2128] bg-[#0F1015] px-3.5 py-1.5 text-[12px] font-medium text-slate-300">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" style={{ animation: 'netlab-pulse-ring 1.8s ease-out infinite' }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Open source · No install · Runs in-browser
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-[-0.04em] leading-[1.06] text-slate-50">
                Your network lab, inside the browser.
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-5 max-w-xl text-[15px] sm:text-base text-slate-400 leading-relaxed">
                Design network topologies, configure multi-vendor devices through real
                vendor CLI, and trace packets hop by hop — no GNS3, no EVE-NG, no
                physical hardware.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <button
                  onClick={onLaunch}
                  className="group flex items-center gap-2 rounded-lg bg-white text-slate-900 text-sm font-semibold px-6 py-3 transition-all duration-200 hover:bg-slate-200 active:scale-[0.98]"
                >
                  Launch Simulator
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <a
                  href="#labs"
                  className="group flex items-center gap-2 rounded-lg border border-[#1F2128] bg-[#0F1015]/60 text-slate-200 text-sm font-medium px-6 py-3 transition-all duration-200 hover:border-sky-500/40 hover:bg-[#0F1015]"
                >
                  Explore Labs
                  <ArrowDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
                </a>
              </div>
            </Reveal>

            <Reveal delay={320}>
              <p className="mt-5 text-[11px] font-mono text-slate-600">
                kazuhaaaaan/NetLab · Apache-2.0 · topology, configs &amp; CLI sessions auto-save
              </p>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:justify-self-end w-full max-w-[560px]">
            <ProductPreview />
          </Reveal>
        </div>
      </div>
    </section>
  );
}