// ============================================================
// HintEngine — petunjuk bertahap (sedikit demi sedikit).
// Setiap langkah berdasar state engine nyata, bukan tebakan.
// ============================================================

import { NetworkStateReader, defaultRouteOf } from './NetworkStateReader';
import { MentorResponse, NetworkState } from './types';

export class HintEngine {
  private cursor = new Map<string, number>();

  constructor(private reader: NetworkStateReader) {}

  /** Ambil langkah petunjuk berikutnya untuk satu topik. */
  next(topic: string): MentorResponse {
    const state = this.reader.read();
    const steps = this.stepsFor(topic, state);
    if (steps.length === 0) {
      return {
        mode: 'hint',
        status: 'info',
        title: `Petunjuk: ${topic}`,
        sections: [{ heading: 'Petunjuk', lines: ['Belum ada data untuk topik ini — coba jalankan simulasi/ping terlebih dahulu.'] }],
        commands: [],
        confidence: 0.4,
      };
    }
    const i = (this.cursor.get(topic) ?? 0) % steps.length;
    this.cursor.set(topic, i + 1);
    const step = steps[i];
    return {
      mode: 'hint',
      status: 'info',
      title: `Petunjuk ${i + 1}/${steps.length}: ${topic}`,
      sections: [
        { heading: 'Petunjuk', lines: [step.lines] },
        ...(step.context.length ? [{ heading: 'Data Engine Saat Ini', lines: step.context }] : []),
      ],
      commands: [],
      confidence: 0.8,
    };
  }

  /** Reset progres petunjuk untuk topik. */
  reset(topic: string): void {
    this.cursor.delete(topic);
  }

  private stepsFor(topic: string, state: NetworkState): { lines: string; context: string[] }[] {
    const t = topic.toLowerCase();
    if (t.includes('routing') || t.includes('route') || t.includes('default')) return this.routingSteps(state);
    if (t.includes('dhcp')) return this.dhcpSteps(state);
    if (t.includes('nat')) return this.natSteps(state);
    if (t.includes('dns')) return this.dnsSteps(state);
    if (t.includes('vlan')) return this.vlanSteps(state);
    if (t.includes('firewall') || t.includes('acl')) return this.firewallSteps(state);
    if (t.includes('switch') || t.includes('mac')) return this.switchSteps(state);
    if (t.includes('interface')) return this.interfaceSteps(state);
    if (t.includes('ping') || t.includes('connect') || t.includes('tcp') || t.includes('unreachable')) return this.pingSteps(state);
    return [];
  }

  private routingSteps(state: NetworkState) {
    const l3 = state.devices.filter((d) => d.isL3 && d.interfaces.some((i) => i.cable));
    const missing = l3.filter((d) => !defaultRouteOf(d) && d.routes.some((r) => r.kind === 'connected'));
    const ctx = missing.map((d) => `${d.name}: tidak ada default route (0.0.0.0/0)`);
    return [
      { lines: 'Buka Routing Table perangkat (MikroTik: /ip route print). Rute mana saja yang tampil?', context: [] },
      { lines: `Perhatikan ${missing[0]?.name ?? 'perangkat target'}: apakah sudah ada Default Route (dst-address=0.0.0.0/0)?`, context: ctx },
      { lines: 'Perhatikan kolom Gateway — apakah gateway berada pada subnet yang sama dengan interface perangkat?', context: [] },
      { lines: 'Cek apakah ada dua rute yang saling menunjuk (routing loop). Bandingkan gateway pada tiap rute.', context: [] },
    ];
  }

  private dhcpSteps(state: NetworkState) {
    const stuck = state.devices.filter((d) => (d.kind === 'pc' || d.kind === 'server') && d.dhcpClientState && d.dhcpClientState !== 'bound' && d.leases.length === 0);
    const ctx = stuck.map((d) => `${d.name}: state=${d.dhcpClientState}, lease kosong`);
    return [
      { lines: `Cek status DHCP client pada ${stuck[0]?.name ?? 'host'}: apakah masih dalam fase discover/request?`, context: ctx },
      { lines: 'Apakah ada DHCP server dengan pool pada segmen (switch) yang sama dengan client?', context: [] },
      { lines: 'Periksa interface DHCP server — apakah pool menunjuk ke interface yang up dan memiliki IP?', context: [] },
      { lines: 'Cek di server: apakah network pool sesuai dengan subnet interface? (mis. /ip dhcp-server network print)', context: [] },
    ];
  }

  private natSteps(state: NetworkState) {
    const l3 = state.devices.filter((d) => d.isL3 && d.natRules.length === 0 && d.routes.some((r) => r.dst === '0.0.0.0/0'));
    const ctx = l3.map((d) => `${d.name}: default route ada, nat rules kosong`);
    return [
      { lines: `Buka NAT pada ${l3[0]?.name ?? 'router'}: /ip firewall nat print. Apakah ada rule chain=srcnat?`, context: ctx },
      { lines: 'Jika trafik dari subnet pribadi keluar ke jaringan lain, pastikan ada action=masquerade.', context: [] },
      { lines: 'Perhatikan out-interface pada rule — harus sama dengan interface yang menuju gateway.', context: [] },
      { lines: 'Ingat: masquerade hanya diperlukan untuk trafik yang keluar ke jaringan yang tidak memiliki route balik.', context: [] },
    ];
  }

  private dnsSteps(state: NetworkState) {
    const clients = state.devices.filter((d) => d.dnsServers.length > 0);
    const ctx = clients.map((d) => `${d.name}: dns-servers=${d.dnsServers.join(', ')}`);
    return [
      { lines: `Cek konfigurasi DNS pada ${clients[0]?.name ?? 'client'}: ke server mana DNS mengarah?`, context: ctx },
      { lines: 'Apakah IP DNS server ada di jaringan? (bandingkan dengan daftar IP perangkat)', context: [] },
      { lines: 'Apakah perangkat DNS server menyala dan dapat dijangkau (ping)?', context: [] },
      { lines: 'Periksa apakah resolusi nama sudah tersedia (record DNS pada server).', context: [] },
    ];
  }

  private vlanSteps(state: NetworkState) {
    const trunks = state.devices.filter((d) => d.trunkPorts.length > 0);
    const ctx = trunks.map((d) => `${d.name}: trunk=${d.trunkPorts.join(', ')}`);
    return [
      { lines: 'Periksa mode port pada kedua ujung kabel (access / trunk).', context: [] },
      { lines: `Cek port trunk: ${trunks[0]?.name ?? '?'} — apakah kedua ujung sama-sama trunk?`, context: ctx },
      { lines: 'Untuk access port: pastikan VLAN di kedua ujung sama (atau sesuai subinterface).', context: [] },
      { lines: 'Jika router-on-a-stick: pastikan vlan-id subinterface cocok dengan VLAN yang dikirim switch.', context: [] },
    ];
  }

  private firewallSteps(state: NetworkState) {
    const withDeny = state.devices.filter((d) => d.acls.some((a) => a.action === 'deny'));
    const ctx = withDeny.map((d) => `${d.name}: ${d.acls.map((a) => `deny ${a.proto ?? 'all'}`).join(', ')}`);
    return [
      { lines: 'Periksa rule firewall yang aktif (MikroTik: /ip firewall filter print).', context: [] },
      { lines: `Apakah ada rule deny yang cocok dengan trafik yang gagal? ${ctx[0] ?? 'Tidak ada rule deny.'}`, context: ctx },
      { lines: 'Periksa urutan rule — rule pertama yang cocok akan diterapkan.', context: [] },
      { lines: 'Tambahkan rule permit sebelum rule deny untuk trafik yang dibutuhkan.', context: [] },
    ];
  }

  private switchSteps(state: NetworkState) {
    const sw = state.devices.find((d) => d.isSwitch && d.macTable.length === 0);
    return [
      { lines: 'Cek MAC table switch: /interface bridge host print (atau show mac address-table).', context: [] },
      { lines: sw ? `MAC table ${sw.name} kosong — cek apakah ada trafik yang melewatinya.` : 'MAC table sudah berisi entri — periksa apakah ada broadcast storm (loop).', context: [] },
      { lines: 'Periksa kabel antar switch — jangan sampai ada loop fisik (dua jalur paralel).', context: [] },
      { lines: 'Jika terjadi broadcast storm, hapus salah satu kabel yang membentuk loop.', context: [] },
    ];
  }

  private interfaceSteps(state: NetworkState) {
    const down = state.devices.flatMap((d) =>
      d.interfaces.filter((i) => i.cable && (!i.up || i.shutdown)).map((i) => `${d.name}:${i.name} ${i.shutdown ? 'shutdown' : 'down'}`)
    );
    return [
      { lines: `Periksa status interface yang terhubung kabel: ${down[0] ?? 'semua up'}.`, context: down },
      { lines: 'Apakah kabel benar-benar terpasang pada kedua ujung?', context: [] },
      { lines: 'Apakah interface dalam keadaan shutdown/disabled? (MikroTik: /interface print)', context: [] },
      { lines: 'Nyalakan interface yang down: /interface enable <nama>.', context: [] },
    ];
  }

  private pingSteps(state: NetworkState) {
    const missing = state.devices.filter((d) => d.isL3 && !defaultRouteOf(d) && d.interfaces.some((i) => i.cable));
    const noIp = state.devices.filter((d) => (d.kind === 'pc' || d.kind === 'server') && !d.ip && d.interfaces.some((i) => i.cable));
    const ctx = [
      ...missing.map((d) => `${d.name}: default route missing`),
      ...noIp.map((d) => `${d.name}: belum punya IP`),
    ];
    return [
      { lines: 'Mulai dari sumber: apakah sumber punya IP dan rute menuju tujuan?', context: noIp.length ? [`${noIp[0].name}: ip=none`] : [] },
      { lines: 'Ikuti jalur paket hop demi hop (paket berhenti di perangkat mana?).', context: [] },
      { lines: `Cek rute di perantara: ${missing[0]?.name ?? 'semua router'} sudah punya default route / rute ke jaringan tujuan?`, context: missing.map((d) => `${d.name}: default route missing`) },
      { lines: 'Periksa gateway: apakah gateway satu segmen dan menyala?', context: [] },
      { lines: 'Periksa firewall/NAT yang mungkin memblok atau mengubah source.', context: ctx },
    ];
  }
}
