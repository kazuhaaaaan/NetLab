import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'lucide-react';

// ── Public links (real destinations only — no dead links) ─────────
export const GITHUB_REPO = 'https://github.com/kazuhaaaaan/NetLab';
export const GITHUB_DOCS = `${GITHUB_REPO}/tree/main/docs`;
export const GITHUB_LICENSE = `${GITHUB_REPO}/blob/main/LICENSE`;
export const GITHUB_CONTRIBUTING = `${GITHUB_REPO}/blob/main/CONTRIBUTING.md`;
export const GITHUB_ROADMAP = `${GITHUB_REPO}/blob/main/ROADMAP.md`;

/** Brand mark used in navbar / footer / hero. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg border border-slate-700/60 bg-[#0F1015]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Network className="text-sky-400" style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}

/**
 * Lightweight reveal-on-scroll wrapper (CSS-only, honors prefers-reduced-motion via
 * the global landing rule in index.css). Used for subtle fade/slide-up entrances.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
  key: _key,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'span';
  key?: React.Key;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -48px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        opacity: shown ? undefined : 0,
        animation: shown ? 'netlab-fade-up 0.6s ease-out both' : undefined,
        animationDelay: shown ? `${delay}ms` : undefined,
      }}
    >
      {children}
    </Tag>
  );
}

/** Shared section heading: mono eyebrow + title + optional description. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-sky-400/80">
        {`// ${eyebrow}`}
      </div>
      <h2 className="mt-3 text-3xl sm:text-[34px] font-bold tracking-[-0.03em] text-slate-50 leading-tight">
        {title}
      </h2>
      {description && (
        <p className={`mt-4 text-sm sm:text-[15px] text-slate-400 leading-relaxed ${center ? 'mx-auto max-w-xl' : ''}`}>
          {description}
        </p>
      )}
    </div>
  );
}