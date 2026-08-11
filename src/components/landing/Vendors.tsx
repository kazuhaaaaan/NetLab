import { VENDOR_MAP } from '../../data/vendors';
import { Reveal, SectionHeading } from './shared';

export function Vendors() {
  const vendors = Object.values(VENDOR_MAP);

  return (
    <section id="vendors" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="supported vendors"
            title="Multi-vendor by design."
            description="Vendor adapters translate each CLI dialect into the same core command objects — so configuration stays authentic, while simulation stays vendor-agnostic."
          />
        </Reveal>

        <Reveal delay={120}>
          <ul className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#1F2128] bg-[#1F2128]">
            {vendors.map((v) => (
              <li key={v.id} className="bg-[#0F1015] p-5 transition-colors duration-200 hover:bg-[#12141a]">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full shrink-0 ${v.badgeColor.split(' ')[0]}`}
                  />
                  <span className="text-[14px] font-semibold tracking-tight text-slate-100">{v.name}</span>
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-slate-500">
                  {v.osName}
                </div>
                <p className="mt-2.5 text-[12.5px] text-slate-400 leading-relaxed">{v.description}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={180}>
          <p className="mt-5 text-[12px] font-mono text-slate-600">
            {vendors.length} vendor operating systems · configure all of them side by side in one lab
          </p>
        </Reveal>
      </div>
    </section>
  );
}