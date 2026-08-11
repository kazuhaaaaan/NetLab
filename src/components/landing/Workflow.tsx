import { Fragment } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

const STEPS = [
  {
    num: '01',
    title: 'Design',
    desc: 'Place routers, switches, firewalls and hosts on the canvas, then connect ports the way you would wire real hardware.',
  },
  {
    num: '02',
    title: 'Configure',
    desc: 'Open a device terminal and configure it in its native dialect — MikroTik menus, Cisco exec modes, Juniper set/commit.',
  },
  {
    num: '03',
    title: 'Connect',
    desc: 'Bring interfaces up, assign IPs, set up VLAN trunking and define routes between subnets.',
  },
  {
    num: '04',
    title: 'Test',
    desc: 'Ping, traceroute and run simulations — then watch packets traverse the topology hop by hop.',
  },
];

export function Workflow() {
  return (
    <section id="workflow" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="workflow"
            title="From empty canvas to working network."
            description="Four steps — the same flow you would follow on physical equipment."
          />
        </Reveal>

        <div className="mt-12 grid w-full min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-10">
          {STEPS.map((s, i) => (
            <Fragment key={s.num}>
              <Reveal delay={i * 90} className="min-w-0">
                <div className="font-mono text-[11px] tracking-[0.2em] text-sky-400/80">{s.num}</div>
                <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-slate-100">{s.title}</h3>
                <p className="mt-2 text-[13px] text-slate-400 leading-relaxed break-words">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <span className="md:hidden flex justify-start mt-4 text-slate-600" aria-hidden="true">
                    <ArrowDown className="w-4 h-4" />
                  </span>
                )}
              </Reveal>
              {i < STEPS.length - 1 && (
                <div aria-hidden="true" className="hidden md:flex self-center justify-center pt-6">
                  <ArrowRight className="w-4 h-4 text-slate-600" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}