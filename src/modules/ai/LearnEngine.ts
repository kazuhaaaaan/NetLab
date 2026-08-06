// ============================================================
// LearnEngine — mode membimbing (tidak langsung memberi jawaban).
// Menyuruh user memeriksa state sendiri, lalu mengecek pemahaman.
// ============================================================

import { NetworkStateReader, defaultRouteOf } from './NetworkStateReader';
import { MentorResponse, NetworkState } from './types';

export class LearnEngine {
  constructor(private reader: NetworkStateReader) {}

  guide(topic: string): MentorResponse {
    const state = this.reader.read();
    const sections = this.stepsFor(topic, state);
    if (sections.length === 0) {
      return {
        mode: 'learn',
        status: 'info',
        title: `Belajar: ${topic}`,
        sections: [{ heading: 'Langkah', lines: ['Topik tidak dikenali. Coba: routing, dhcp, nat, dns, vlan, firewall, switch.'] }],
        commands: [],
        confidence: 0.4,
      };
    }
    return {
      mode: 'learn',
      status: 'info',
      title: `Belajar: ${topic}`,
      sections,
      commands: [],
      confidence: 0.8,
    };
  }

  private stepsFor(topic: string, state: NetworkState): { heading: string; lines: string[] }[] {
    const t = topic.toLowerCase();

    if (t.includes('routing') || t.includes('route')) {
      const dev = state.devices.find((d) => d.isL3 && d.interfaces.some((i) => i.cable));
      const hasDefault = dev ? !!defaultRouteOf(dev) : null;
      return [
        {
          heading: 'Langkah',
          lines: [
            `1. Buka terminal ${dev?.name ?? 'router'} dan ketik: /ip route print.`,
            `2. Tuliskan rute yang tampil di tabel (dst-address, gateway, interface).`,
            `3. Apakah ada rute dengan dst-address=0.0.0.0/0? ${hasDefault === null ? '' : hasDefault ? '(saat ini: ADA)' : '(saat ini: BELUM ADA)'}`,
            `4. Untuk setiap rute, perhatikan gateway-nya — apakah gateway berada pada subnet yang sama?`,
            `5. Apa yang terjadi pada paket yang menuju jaringan tanpa rute?`,
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Sebutkan kegunaan default route.',
            '- Kapan sebuah gateway disebut "valid"?',
            '- Apa itu longest prefix match? (bandingkan rute /24 vs /0)',
          ],
        },
      ];
    }

    if (t.includes('dhcp')) {
      return [
        {
          heading: 'Langkah',
          lines: [
            '1. Amati alur DHCP: DISCOVER → OFFER → REQUEST → ACK.',
            '2. Di server, cek: /ip dhcp-server print dan /ip dhcp-server network print.',
            '3. Samakan network pool dengan subnet interface server.',
            '4. Pastikan client dan server berada pada segmen L2 yang sama.',
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Mengapa DISCOVER dikirim ke 255.255.255.255?',
            '- Apa peran yiaddr pada paket OFFER?',
            '- Apa yang terjadi jika lease habis?',
          ],
        },
      ];
    }

    if (t.includes('nat')) {
      return [
        {
          heading: 'Langkah',
          lines: [
            '1. Pahami kapan NAT masquerade diperlukan (trafik keluar dari subnet pribadi).',
            '2. Buka: /ip firewall nat print — identifikasi chain=srcnat.',
            '3. Perhatikan out-interface rule — harus menunjuk ke interface keluar.',
            '4. Simulasikan: ping dari host ke jaringan lain, lalu amati apakah source berubah.',
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Apa beda source NAT vs destination NAT?',
            '- Mengapa return traffic bisa balik setelah masquerade?',
          ],
        },
      ];
    }

    if (t.includes('vlan')) {
      return [
        {
          heading: 'Langkah',
          lines: [
            '1. Pahami perbedaan access port dan trunk port.',
            '2. Cek konfigurasi VLAN di switch (MikroTik: /interface bridge vlan print).',
            '3. Pastikan dua ujung link memiliki mode yang sama.',
            '4. Untuk router-on-a-stick, cocokkan vlan-id subinterface dengan VLAN switch.',
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Kapan sebuah port harus trunk?',
            '- Apa fungsi tag 802.1Q pada frame?',
          ],
        },
      ];
    }

    if (t.includes('dns')) {
      return [
        {
          heading: 'Langkah',
          lines: [
            '1. Cek /ip dns print pada client — ke server mana query dikirim?',
            '2. Pastikan server DNS punya record (MikroTik: /ip dns static print).',
            '3. Uji resolusi: curl <hostname> — apakah berhasil?',
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Apa perbedaan DNS server vs DNS record?',
            '- Mengapa client butuh rute ke server DNS?',
          ],
        },
      ];
    }

    if (t.includes('firewall') || t.includes('acl')) {
      return [
        {
          heading: 'Langkah',
          lines: [
            '1. Buka /ip firewall filter print — amati urutan rule.',
            '2. Rule pertama yang cocok akan diterapkan (urutan sangat penting).',
            '3. Identifikasi rule deny yang mungkin memblok trafik yang dibutuhkan.',
          ],
        },
        {
          heading: 'Periksa Pemahaman',
          lines: [
            '- Mengapa urutan rule firewall penting?',
            '- Apa perbedaan chain=input dan chain=forward?',
          ],
        },
      ];
    }

    return [];
  }
}
