import React, { useEffect, useState } from 'react';
import { ArrowRight, Github, Heart, Menu, X } from 'lucide-react';
import { GITHUB_REPO, LogoMark } from './shared';

interface NavbarProps {
  onLaunch: () => void;
  onOpenDonate: () => void;
}

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Vendors', href: '#vendors' },
  { label: 'Labs', href: '#labs' },
  { label: 'CLI', href: '#cli' },
  { label: 'Documentation', href: 'https://github.com/kazuhaaaaan/NetLab/tree/main/docs', external: true },
];

export function Navbar({ onLaunch, onOpenDonate }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? 'bg-[#0B0C0E]/90 backdrop-blur border-b border-white/[0.06]'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between gap-4" aria-label="Main">
        <a href="#top" className="flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <LogoMark size={34} />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-slate-100">NetLab</span>
            <span className="text-[10px] font-mono text-slate-500 tracking-[0.18em] uppercase">by KazuDev</span>
          </span>
        </a>

        <div className="hidden lg:flex items-center gap-7">
          {NAV_LINKS.map((l) =>
            l.external ? (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium text-slate-400 hover:text-slate-100 transition-colors"
              >
                {l.label}
              </a>
            ) : (
              <a
                key={l.label}
                href={l.href}
                className="text-[13px] font-medium text-slate-400 hover:text-slate-100 transition-colors"
              >
                {l.label}
              </a>
            )
          )}
        </div>

        <div className="hidden lg:flex items-center gap-2.5">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NetLab on GitHub"
            className="flex items-center gap-1.5 rounded-md border border-[#1F2128] bg-[#0F1015] text-slate-300 text-[13px] font-medium px-3 py-2 transition-colors hover:text-slate-100 hover:border-slate-500/60"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <button
            onClick={onOpenDonate}
            aria-label="Donate to support the developer"
            title="Donasi untuk mendukung developer"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-rose-300 hover:text-rose-200 transition-colors"
          >
            <Heart className="w-4 h-4 text-rose-400" />
            <span className="sr-only lg:not-sr-only">Donate</span>
          </button>
          <button
            onClick={onLaunch}
            className="group flex items-center gap-1.5 rounded-md bg-white text-slate-900 text-[13px] font-semibold px-4 py-2 transition-all duration-200 hover:bg-slate-200 active:scale-[0.98]"
          >
            Launch Simulator
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md border border-[#1F2128] bg-[#0F1015] text-slate-300"
        >
          {menuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-white/[0.06] bg-[#0B0C0E]/95 backdrop-blur">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.external ? '_blank' : undefined}
                rel={l.external ? 'noopener noreferrer' : undefined}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-2.5 px-3">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLaunch();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-white text-slate-900 text-[13px] font-semibold px-4 py-2.5"
              >
                Launch Simulator
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="NetLab on GitHub"
                className="flex items-center justify-center w-10 h-10 rounded-md border border-[#1F2128] bg-[#0F1015] text-slate-300"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}