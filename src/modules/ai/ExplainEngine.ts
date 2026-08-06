// ============================================================
// ExplainEngine — menjelaskan konsep & objek tertentu
// (paket, rute, alur DHCP) dengan data dari state engine.
// ============================================================

import { NetworkStateReader } from './NetworkStateReader';
import { NetworkState, DeviceState, MentorResponse } from './types';

export class ExplainEngine {
  constructor(private reader: NetworkStateReader) {}

  /** Jelaskan mengapa sebuah paket berjalan (atau berhenti) seperti itu. */
  explainPacket(packet: {
    id: string;
    src?: string;
    dst?: string;
    protocol?: string;
    ttl?: number;
    dropped?: boolean;
    reason?: string;
  }): MentorResponse {
    const state = this.reader.read();
    const src = packet.src ? this.locate(state, packet.src) : undefined;
    const dst = packet.dst ? this.locate(state, packet.dst) : undefined;

    const lines: string[] = [];
    if (src) lines.push(`Paket berasal dari ${src.device.name} (IP ${packet.src}), interface ${src.iface.name}.`);
    if (dst) lines.push(`Paket menuju ${dst.device.name} (IP ${packet.dst}), interface ${dst.iface.name}.`);
    lines.push(`Protokol ${packet.protocol ?? 'IP'}, TTL awal ${packet.ttl ?? '?'}.`);

    if (packet.dropped) {
      lines.push(`Paket DROP ${packet.reason ? `— alasan: ${packet.reason}` : ''}.`);
      lines.push('Biasanya penyebabnya: tidak ada rute, gateway mati, firewall deny, atau TTL habis.');
    } else {
      lines.push('Paket berhasil diteruskan/diterima (tidak drop).');
    }

    return {
      mode: 'explain',
      status: 'info',
      title: 'Penjelasan Paket',
      sections: [{ heading: 'Jalur Paket', lines }],
      commands: [],
      confidence: 0.9,
    };
  }

  /** Jelaskan bagaimana perangkat menentukan rute menuju tujuan. */
  explainRoute(deviceId: string, dstIp: string): MentorResponse {
    const state = this.reader.read();
    const dev = state.devices.find((d) => d.nodeId === deviceId || d.name === deviceId);
    if (!dev) {
      return {
        mode: 'explain',
        status: 'problem',
        title: 'Perangkat Tidak Ditemukan',
        sections: [{ heading: 'Info', lines: [`Perangkat "${deviceId}" tidak ada di topologi.`] }],
        commands: [],
        confidence: 0.4,
      };
    }

    const matches = dev.routes
      .filter((r) => this.covers(r.dst, dstIp))
      .sort((a, b) => this.prefixLen(b.dst) - this.prefixLen(a.dst));
    const best = matches[0];

    const lines = [
      `Perangkat ${dev.name} menerima paket tujuan ${dstIp}.`,
      'Tabel route dicari dengan longest prefix match:',
      ...matches.map((r) => `  • ${r.dst} via ${r.gateway ?? '-'} (iface ${r.iface})${r === best ? '  ← terpilih' : ''}`),
    ];
    if (!best) {
      lines.push('Tidak ada rute yang cocok → paket dibuang (no route).');
    } else if (best.dst === '0.0.0.0/0') {
      lines.push('Default route yang cocok — ini jalan terakhir untuk paket "tak dikenal".');
    }

    return {
      mode: 'explain',
      status: best ? 'healthy' : 'problem',
      title: `Penjelasan Rute: ${dstIp} dari ${dev.name}`,
      sections: [
        { heading: 'Longest Prefix Match', lines },
        ...(dev.ip ? [{ heading: 'Alamat Perangkat', lines: [`${dev.name} = ${dev.ip}`] }] : []),
      ],
      commands: [],
      confidence: 0.9,
    };
  }

  /** Jelaskan alur DHCP secara berurutan. */
  explainDhcp(deviceId: string): MentorResponse {
    const state = this.reader.read();
    const dev = state.devices.find((d) => d.nodeId === deviceId || d.name === deviceId);
    const phase = dev?.dhcpClientState ?? 'none';
    const lease = dev?.leases[0];

    const flow: Record<string, string> = {
      discover: 'CLIENT mengirim DISCOVER (broadcast) untuk mencari DHCP server.',
      offer: 'SERVER membalas OFFER berisi IP yang ditawarkan.',
      request: 'CLIENT memilih tawaran, mengirim REQUEST.',
      bound: 'SERVER mengirim ACK → CLIENT resmi mendapat IP.',
    };

    const lines = [
      `Client ${dev?.name ?? deviceId} berada pada fase "${phase}".`,
      ...(phase in flow ? [flow[phase]] : []),
      ...(lease
        ? [`Lease aktif di interface ${lease.iface}: ${lease.ip} (expires ${lease.expiresAt})`]
        : ['Belum ada lease yang aktif.']),
    ];

    return {
      mode: 'explain',
      status: phase === 'bound' ? 'healthy' : 'info',
      title: `Alur DHCP: ${dev?.name ?? deviceId}`,
      sections: [
        { heading: 'Alur DORA', lines: ['DISCOVER → OFFER → REQUEST → ACK'] },
        { heading: 'Status Saat Ini', lines },
      ],
      commands: [],
      confidence: 0.9,
    };
  }

  private covers(cidr: string, ip: string): boolean {
    const [net, bits = '32'] = cidr.split('/');
    const mask = bits === '32' ? -1 : ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
    return (this.ipInt(net) & mask) === (this.ipInt(ip) & mask);
  }

  private prefixLen(cidr: string): number {
    return parseInt(cidr.split('/')[1] ?? '32', 10);
  }

  private ipInt(ip: string): number {
    return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
  }

  private locate(state: NetworkState, ip: string): { device: DeviceState; iface: DeviceState['interfaces'][number] } | undefined {
    for (const d of state.devices) {
      for (const i of d.interfaces) {
        if (i.ip && i.ip.split('/')[0] === ip) return { device: d, iface: i };
      }
      if (d.ip === ip) {
        const iface = d.interfaces[0];
        return { device: d, iface: iface ?? { name: '(no-iface)', up: false } as DeviceState['interfaces'][number] };
      }
    }
    return undefined;
  }
}
