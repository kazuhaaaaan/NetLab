import { ArrowUpRight, FileCode2, FolderGit2, GitBranch, Map } from 'lucide-react';
import { GITHUB_CONTRIBUTING, GITHUB_DOCS, GITHUB_LICENSE, GITHUB_REPO, GITHUB_ROADMAP, Reveal, SectionHeading } from './shared';

const LINKS = [
  { label: 'GitHub repository', desc: 'kazuhaaaaan/NetLab', href: GITHUB_REPO, icon: FolderGit2 },
  { label: 'Documentation', desc: 'docs/ — architecture & guides', href: GITHUB_DOCS, icon: FileCode2 },
  { label: 'License', desc: 'Apache-2.0', href: GITHUB_LICENSE, icon: Map },
  { label: 'Contributing', desc: 'issues, PRs, code of conduct', href: GITHUB_CONTRIBUTING, icon: GitBranch },
  { label: 'Roadmap', desc: 'planned engine & protocols work', href: GITHUB_ROADMAP, icon: GitBranch },
];

export function OpenSource() {
  return (
    <section id="opensource" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid w-full min-w-0 grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <Reveal>
            <SectionHeading
              eyebrow="open source"
              title="Open source, from the first commit."
              description="NetLab is built in the open and licensed under Apache-2.0 — free for education, personal labs and enterprise networking practice. The whole simulation stack runs client-side; there is no account, telemetry or vendor lock-in."
            />
            <div className="mt-6 rounded-xl border border-[#1F2128] bg-[#0F1015] p-5">
              <p className="text-[13px] text-slate-400 leading-relaxed">
                This project does not display inflated metrics. Stars, contributors and
                downloads are always one click away on GitHub — check the real numbers
                before you trust anything.
              </p>
              <a
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white text-slate-900 text-sm font-semibold px-5 py-2.5 transition-all duration-200 hover:bg-slate-200"
              >
                Visit the repository
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <ul className="rounded-xl border border-[#1F2128] bg-[#0F1015] divide-y divide-[#1F2128]">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-4 px-5 py-4 transition-colors duration-150 hover:bg-[#12141a]"
                  >
                    <span className="flex items-center justify-center w-9 h-9 rounded-md border border-[#1F2128] bg-[#0B0C0E] shrink-0">
                      <l.icon className="w-4 h-4 text-sky-400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-slate-100">{l.label}</span>
                      <span className="block text-[12px] font-mono text-slate-500 truncate">{l.desc}</span>
                    </span>
                    <ArrowUpRight className="w-4 h-4 text-slate-600 transition-all group-hover:text-sky-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}