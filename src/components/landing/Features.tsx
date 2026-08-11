import { Boxes, Layers3, Network, Radar, Save, SquareTerminal } from 'lucide-react';
import { Reveal, SectionHeading } from './shared';

const FEATURES = [
  {
    icon: Network,
    title: 'Topology design',
    desc: 'Visual canvas with port-aware devices. Drag routers, switches, firewalls, wireless APs and hosts, then wire them with straight, crossover, fiber or serial cables.',
  },
  {
    icon: SquareTerminal,
    title: 'Multi-vendor CLI',
    desc: 'Eleven vendor operating systems — MikroTik RouterOS, Cisco IOS/NX-OS, Juniper JunOS, Huawei VRP, FortiOS, VyOS, EdgeOS, ArubaOS-CX, OpenWrt and Debian — each with authentic command syntax in its own terminal tab.',
  },
  {
    icon: Radar,
    title: 'Packet-level simulation',
    desc: 'Packets are really forwarded hop by hop: ARP resolution, MAC learning, longest-prefix-match routing, TTL decrement, and return-path checking decide what gets through.',
  },
  {
    icon: Boxes,
    title: 'Connectivity testing',
    desc: 'Ping and traceroute against real ICMP. Follow the exact path packets take, read the TTL at the destination, and see why a test fails — no route, TTL exceeded, or unreachable host.',
  },
  {
    icon: Layers3,
    title: 'Protocol stack in the browser',
    desc: 'VLAN trunking and inter-VLAN routing, DHCP pools and leases, NAT, DNS, STP, OSPF, BGP, firewall rules and QoS — all simulated, all configurable through the CLI.',
  },
  {
    icon: Save,
    title: 'Zero setup, persistent state',
    desc: 'Everything runs client-side and auto-saves: topology, device configs and open CLI sessions survive a refresh. Export a lab or share it as a single link.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-20 py-20 sm:py-28 border-t border-[#14161c]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="capabilities"
            title="Built like a real network lab."
            description="A visual topology editor on top of an actual simulation engine — configure devices the way you would on hardware, then watch packets behave accordingly."
          />
        </Reveal>

        <div className="mt-12 grid w-full min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 70}>
              <div className="h-full rounded-xl border border-[#1F2128] bg-[#0F1015] p-6 transition-all duration-200 hover:border-slate-600/60 hover:-translate-y-0.5">
                <div className="flex items-center justify-center w-10 h-10 rounded-md border border-[#1F2128] bg-[#0B0C0E] mb-4">
                  <f.icon className="w-5 h-5 text-sky-400" />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight text-slate-100">{f.title}</h3>
                <p className="mt-2 text-[13px] text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}