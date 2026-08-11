import { Github, Heart } from 'lucide-react';
import { GITHUB_CONTRIBUTING, GITHUB_DOCS, GITHUB_LICENSE, GITHUB_REPO, LogoMark } from './shared';

interface FooterProps {
  onLaunch: () => void;
  onOpenDonate: () => void;
}

const PRODUCT_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Vendors', href: '#vendors' },
  { label: 'Labs', href: '#labs' },
  { label: 'CLI preview', href: '#cli' },
];

const RESOURCE_LINKS = [
  { label: 'GitHub', href: GITHUB_REPO, external: true },
  { label: 'Documentation', href: GITHUB_DOCS, external: true },
  { label: 'License (Apache-2.0)', href: GITHUB_LICENSE, external: true },
  { label: 'Contributing', href: GITHUB_CONTRIBUTING, external: true },
];

export function Footer({ onLaunch, onOpenDonate }: FooterProps) {
  return (
    <footer className="border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12">
        <div className="grid w-full min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-10">
          <div>
            <div className="flex items-center gap-3">
              <LogoMark size={32} />
              <div className="flex flex-col leading-none">
                <span className="text-[14px] font-bold tracking-tight text-slate-100">NetLab</span>
                <span className="text-[10px] font-mono text-slate-600 tracking-[0.16em] uppercase">by KazuDev</span>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-[13px] text-slate-400 leading-relaxed">
              Open-source, browser-based network simulator. Multi-vendor CLI, real
              packet simulation and persistent labs — no hardware required.
            </p>
            <button
              onClick={onLaunch}
              className="mt-5 flex items-center gap-2 rounded-lg bg-white text-slate-900 text-[13px] font-semibold px-4 py-2 transition-all duration-200 hover:bg-slate-200"
            >
              Launch Simulator
            </button>
          </div>

          <nav aria-label="Product">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">Product</h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-[13px] text-slate-400 hover:text-slate-100 transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Resources">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500">Resources</h3>
            <ul className="mt-4 space-y-2.5">
              {RESOURCE_LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 pt-6 border-t border-[#14161c] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] font-mono text-slate-600">
            © {new Date().getFullYear()} KazuDev — NetLab is Apache-2.0 licensed
          </p>
          <div className="flex items-center gap-4">
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="NetLab on GitHub"
              className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <button
              onClick={onOpenDonate}
              aria-label="Donate to support the developer"
              title="Donasi untuk mendukung developer"
              className="flex items-center gap-1.5 text-[12px] text-rose-300 hover:text-rose-200 transition-colors"
            >
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              Donate
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}