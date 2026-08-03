// Panduan Konfigurasi per vendor — ditulis dengan bahasa awam ("bahasa bayi")
// supaya orang yang baru belajar jaringan tetap bisa mengerti.
// Semua perintah di sini BENAR-BENAR berjalan di simulator.

export interface GuideStep {
  command: string;
  title: string;
  note?: string;
  /** Penjelasan bahasa awam — tanpa istilah ribet. */
  explain: string;
}

export interface VendorGuide {
  vendorId: string;
  label: string;
  /** pesan singkat di header panel */
  intro: string;
  /** apa saja yang bisa dikonfigurasi di vendor ini (daftar singkat) */
  capabilities: string[];
  steps: GuideStep[];
}

export const BEGINNER_GUIDES: VendorGuide[] = [
  {
    vendorId: 'mikrotik',
    label: 'MikroTik RouterOS',
    intro: 'Router paling populer di Indonesia. Caranya: ketik perintah yang diawali "/", seperti menu di game. Ganti etherX dengan nama port di perangkatmu.',
    capabilities: ['IP & interface', 'Routing (tabel rute)', 'Hostname', 'VLAN', 'DHCP server', 'DNS', 'NAT internet', 'Firewall', 'BGP'],
    steps: [
      {
        command: '/interface print',
        title: '1. Lihat daftar port (interface)',
        note: 'Cari nama port yang mau diberi IP (contoh: ether1, ether2).',
        explain: 'Bayangkan perangkatmu punya beberapa lubang kabel. Perintah ini menunjukkan daftar lubang tersebut. Catat nama lubangnya, misalnya ether1 atau ether2 — nama inilah yang akan kamu pakai di langkah berikutnya.',
      },
      {
        command: '/ip address add address=192.168.88.1/24 interface=ether1',
        title: '2. Beri alamat IP pada sebuah port',
        note: 'Format: /ip address add address=IP/MASK interface=NAMA_PORT.',
        explain: 'IP itu seperti alamat rumah. Rumah butuh nomor supaya bisa dikirimi surat, begitu juga perangkat. Perintah ini memberi alamat 192.168.88.1 ke lubang ether1. Bagian /24 artinya "alamat rumah dalam satu kompleks", jadi semua alamat 192.168.88.x dianggap satu kompleks yang sama.',
      },
      {
        command: '/ip address print',
        title: '3. Verifikasi IP',
        note: 'Pastikan IP muncul di daftar dengan status enabled.',
        explain: 'Cek hasil pekerjaanmu. Seperti mengecek apakah surat sudah benar-benar sampai — di sini kita lihat apakah IP benar-benar terpasang di port.',
      },
      {
        command: '/system identity set name=Router-Kantor',
        title: '4. Ganti nama perangkat (hostname)',
        note: 'Biar gampang dibedakan kalau ada banyak router.',
        explain: 'Seperti memberi nama panggilan pada hewan peliharaanmu. Kalau kantormu punya 10 router, memberi nama membuatmu tidak bingung mana yang mana saat mengurusnya.',
      },
      {
        command: '/system identity print',
        title: '5. Lihat nama perangkat',
        explain: 'Menunjukkan nama yang barusan kamu berikan.',
      },
      {
        command: '/ip route add dst-address=0.0.0.0/0 gateway=10.0.0.1',
        title: '6. Tambah rute (jalan keluar)',
        note: 'Rute default 0.0.0.0/0 dipakai untuk kirim paket ke jaringan lain. Gateway = IP tetangga yang terhubung.',
        explain: 'Bayangkan kamu di sebuah kompleks perumahan. Untuk keluar ke kota, kamu harus melewati gerbang utama. Rute default = petunjuk "kalau mau ke tempat yang bukan kompleks ini, lewat gerbang 10.0.0.1". Tanpa ini, paketmu nyasar di dalam kompleks saja.',
      },
      {
        command: '/ip route print',
        title: '7. Verifikasi tabel rute',
        explain: 'Menampilkan peta "jalan keluar" yang sudah kamu buat.',
      },
      {
        command: '/interface vlan add name=vlan10 vlan-id=10 interface=ether2',
        title: '8. Buat VLAN (khusus switch)',
        note: 'VLAN = memecah satu switch jadi beberapa jaringan terpisah.',
        explain: 'VLAN itu seperti partisi di komputer: satu switch fisik bisa dipecah jadi beberapa "jaringan kecil" yang terpisah. Misal VLAN 10 untuk karyawan, VLAN 20 untuk tamu — mereka tidak bisa saling melihat, padahal switch-nya cuma satu.',
      },
      {
        command: '/interface vlan print',
        title: '9. Lihat daftar VLAN',
        explain: 'Menampilkan VLAN yang sudah dibuat.',
      },
      {
        command: '/ip pool add name=pool1 ranges=192.168.88.100-192.168.88.200',
        title: '10. Siapkan "kotak" IP untuk dibagikan (DHCP)',
        note: 'Pool = kumpulan IP yang boleh dipinjam perangkat lain.',
        explain: 'DHCP itu seperti petugas parkir yang mengarahkan mobil ke tempat kosong. Kamu siapkan dulu 100 "tempat kosong" (dari IP 192.168.88.100 sampai .200), nanti setiap perangkat yang colok akan diberi IP otomatis dari kotak ini.',
      },
      {
        command: '/ip dhcp-server add name=dhcp1 interface=ether1 address-pool=pool1',
        title: '11. Nyalakan server DHCP di port',
        note: 'Setelah ini, perangkat yang colok ke ether1 dapat IP otomatis.',
        explain: 'Sekarang petugas parkir mulai bekerja: setiap perangkat yang mencolok ke port ether1 langsung diberi IP dari kotak tadi, tanpa kamu set manual satu-satu. Hemat waktu banget kalau banyak perangkat.',
      },
      {
        command: '/ip dhcp-server print',
        title: '12. Lihat daftar DHCP server',
        explain: 'Cek apakah petugas parkir sudah berdiri di posnya.',
      },
      {
        command: '/ip dhcp-client add interface=ether2 add-default-route=yes',
        title: '12b. Jadikan device lain DHCP client (opsional)',
        note: 'Jalankan di device yang ingin dapat IP otomatis, misal router/host yang colok ke ether2.',
        explain: 'Kebalikan dari DHCP server: di sini perangkatmu jadi "penyewa" — ia minta IP ke petugas parkir di segmen yang sama. Tambahan add-default-route=yes membuat rute default ikut terisi otomatis dari gateway yang diberikan server. Cek hasilnya dengan /ip dhcp-client print (status bound = berhasil).',
      },
      {
        command: '/ip dns set servers=8.8.8.8',
        title: '13. Atur DNS (buku telepon internet)',
        note: 'DNS = penerjemah nama domain menjadi IP. 8.8.8.8 = DNS publik Google.',
        explain: 'Kamu mengetik "google.com", tapi komputer hanya paham angka. DNS itu seperti buku telepon: mencari nama, lalu memberi nomornya. Perintah ini memberi tahu router buku telepon mana yang dipakai.',
      },
      {
        command: '/ip dns print',
        title: '14. Lihat pengaturan DNS',
        explain: 'Menampilkan buku telepon yang sedang dipakai.',
      },
      {
        command: '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade',
        title: '15. Nyalakan NAT (internet untuk semua)',
        note: 'NAT = satu IP publik dipakai bersama banyak perangkat di LAN.',
        explain: 'Rumahmu biasanya cuma punya 1 nomor IP publik dari internet, tapi banyak perangkat. NAT itu seperti satpam di lobi: semua penghuni (perangkat) boleh keluar lewat satu pintu, dan surat balasannya diantar kembali ke penghuni yang benar. Ini cara internet bisa dipakai seluruh kantor dengan 1 IP saja.',
      },
      {
        command: '/ip firewall nat print',
        title: '16. Lihat aturan NAT',
        explain: 'Menampilkan siapa satpam lobinya dan cara kerjanya.',
      },
      {
        command: 'ping 192.168.88.2',
        title: '17. Uji koneksi dengan ping',
        note: 'Ganti IP dengan IP device tetangga. Ping berhasil jika ada reply.',
        explain: 'Ping itu seperti mengetuk pintu tetangga dan menunggu "ya?". Kalau ada balasan, berarti kabel dan pengaturanmu benar. Kalau tidak ada balasan, ada yang salah di salah satu langkah tadi.',
      },
    ],
  },
  {
    vendorId: 'cisco_ios',
    label: 'Cisco IOS',
    intro: 'Cisco memakai "mode": masuk ke pengaturan (configure terminal), pilih port, baru kasih IP. Perintah dijalankan dari prompt Router#.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DHCP server', 'DNS', 'BGP', 'ACL', 'STP'],
    steps: [
      {
        command: 'show ip interface brief',
        title: '1. Lihat daftar port',
        note: 'Cari nama interface (Gi0/0, Gi0/1, Fa0/1, dst).',
        explain: 'Daftar semua lubang kabel di perangkat. Kolom "IP-Address" yang masih kosong artinya belum dikasih alamat. Catat nama portnya — di Cisco biasanya seperti Gi0/0 atau Gi0/1.',
      },
      {
        command: 'configure terminal',
        title: '2. Masuk mode pengaturan',
        note: 'Prompt berubah menjadi Router(config)#.',
        explain: 'Di Cisco kamu harus masuk "dapur" dulu sebelum memasak. Mode pengaturan ini tempatnya mengubah semua setelan. Prompt bertanda (config)# menandakan kamu sudah di dapur.',
      },
      {
        command: 'hostname R1',
        title: '3. Ganti nama perangkat',
        note: 'Cara memberi identitas di Cisco.',
        explain: 'Memberi nama panggilan pada perangkat, misalnya R1 untuk Router 1. Kalau jaringanmu besar, ini menyelamatkanmu dari kebingungan.',
      },
      {
        command: 'interface Gi0/0',
        title: '4. Pilih port yang mau dikonfigurasi',
        note: 'Prompt berubah menjadi Router(config-if)#. Ganti Gi0/0 dengan nama port di perangkatmu.',
        explain: 'Sekarang kamu memilih lubang kabel mana yang mau diberi alamat. Prompt (config-if)# artinya kamu sudah "di dalam" port tersebut.',
      },
      {
        command: 'ip address 192.168.88.1 255.255.255.0',
        title: '5. Beri IP + netmask pada port',
        note: 'Format: ip address IP MASK. 255.255.255.0 = /24.',
        explain: 'Memberi alamat rumah pada port ini. 255.255.255.0 adalah cara Cisco menulis "/24" — artinya semua alamat 192.168.88.x dianggap satu kompleks.',
      },
      {
        command: 'no shutdown',
        title: '6. Nyalakan port',
        note: 'Port Cisco default mati (shutdown) saat dikonfigurasi.',
        explain: 'Lampu port Cisco biasanya dimatikan dari pabrik. "no shutdown" artinya nyalakan lampunya. Tanpa ini, kabel sudah benar tapi tidak ada aliran data.',
      },
      {
        command: 'exit',
        title: '7. Keluar dari mode port',
        explain: 'Kembali ke dapur utama (mode global). Seperti menutup pintu kamar setelah selesai berbenah.',
      },
      {
        command: 'ip route 0.0.0.0 0.0.0.0 10.0.0.1',
        title: '8. Tambah jalan keluar (rute default)',
        note: 'Format: ip route TUJUAN NETMASK GATEWAY.',
        explain: '0.0.0.0 0.0.0.0 artinya "ke mana pun yang tidak kukenal". Perintah ini bilang: kalau ada paket ke alamat asing, kirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'vlan 10',
        title: '9. Buat VLAN (khusus switch)',
        note: 'Lanjutkan dengan "name <nama>" bila perlu.',
        explain: 'Memecah switch jadi beberapa jaringan terpisah — seperti membuat sekat di ruangan besar. VLAN 10 bisa untuk karyawan, VLAN 20 untuk server.',
      },
      {
        command: 'ip dhcp pool LAN',
        title: '10. Buat kolam IP otomatis (DHCP)',
        note: 'Lanjutkan dengan "network" dan "default-router".',
        explain: 'Membuka "layanan petugas parkir": perangkat yang colok akan diberi IP otomatis. Nama pool-nya LAN.',
      },
      {
        command: 'network 192.168.88.0 255.255.255.0',
        title: '11. Tentukan jaringan yang dibagikan',
        note: 'Harus dijalankan setelah "ip dhcp pool".',
        explain: 'Memberi tahu petugas parkir kompleks mana yang boleh dipakai: kompleks 192.168.88.x.',
      },
      {
        command: 'default-router 192.168.88.1',
        title: '12. Tentukan gerbang untuk klien DHCP',
        note: 'Harus dijalankan setelah "ip dhcp pool".',
        explain: 'Memberi tahu perangkat yang dapat IP: "kalau mau keluar kompleks, lewat gerbang 192.168.88.1".',
      },
      {
        command: 'exit',
        title: '13. Keluar dari mode pengaturan',
        explain: 'Selesai memasak, keluar dari dapur.',
      },
      {
        command: 'configure terminal',
        title: '13b. Jadikan device lain DHCP client (opsional)',
        note: 'Masuk mode pengaturan, pilih port yang menghadap DHCP server, lalu ketik "ip address dhcp".',
        explain: 'Di device yang ingin dapat IP otomatis (bukan yang jadi server): configure terminal → interface <port> → ip address dhcp. Perangkat akan minta IP ke server di segmen yang sama. Cek dengan "show ip interface brief" — kolom IP-Address akan terisi.',
      },
      {
        command: 'ip name-server 8.8.8.8',
        title: '14. Atur DNS',
        note: 'Perlu masuk configure terminal dulu.',
        explain: 'Memberi tahu router buku telepon internet mana yang dipakai (8.8.8.8 = DNS Google yang gratis).',
      },
      {
        command: 'show ip interface brief',
        title: '15. Cek semua IP',
        explain: 'Lihat hasil kerja: port mana yang sudah dapat alamat dan menyala.',
      },
      {
        command: 'ping 192.168.88.2',
        title: '16. Uji koneksi dengan ping',
        note: '!!!!! = semua reply sukses. ..... = gagal (periksa IP/rute).',
        explain: 'Mengetuk pintu tetangga. Lima tanda seru berarti pintu terbuka semua — koneksi lancar. Titik-titik berarti tidak ada yang menjawab, ada yang salah di langkah sebelumnya.',
      },
    ],
  },
  {
    vendorId: 'cisco_nxos',
    label: 'Cisco NX-OS',
    intro: 'Saudara muda Cisco IOS, dipakai di switch data center (ruang server). Mirip cara kerjanya: interface → ip address → no shutdown.',
    capabilities: ['IP & interface', 'VLAN', 'Hostname', 'DNS', 'DHCP server', 'BGP (data center)'],
    steps: [
      {
        command: 'show ip interface brief',
        title: '1. Lihat daftar port',
        note: 'Di NX-OS nama port biasanya Eth1/1, Eth1/2, dst.',
        explain: 'Daftar lubang kabel di switch ruang server. Nama port di NX-OS memakai format Eth1/1 — slot 1, lubang 1.',
      },
      {
        command: 'configure terminal',
        title: '2. Masuk mode pengaturan',
        explain: 'Seperti masuk dapur: semua setelan diubah dari sini.',
      },
      {
        command: 'hostname DC-SW1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan, misalnya DC-SW1 (Data Center Switch 1).',
      },
      {
        command: 'interface Eth1/1',
        title: '4. Pilih port',
        note: 'Ganti Eth1/1 dengan nama port di perangkatmu.',
        explain: 'Memilih lubang kabel yang mau diatur.',
      },
      {
        command: 'ip address 10.0.0.2/24',
        title: '5. Beri IP (format CIDR)',
        note: 'NX-OS memakai format IP/MASK, bukan IP + netmask terpisah.',
        explain: 'Memberi alamat pada port. /24 = satu kompleks kecil (256 alamat).',
      },
      {
        command: 'no shutdown',
        title: '6. Nyalakan port',
        explain: 'Menyalakan lampu port yang tadinya mati.',
      },
      {
        command: 'exit',
        title: '7. Keluar dari mode port',
        explain: 'Kembali ke mode global.',
      },
      {
        command: 'vlan 10',
        title: '8. Buat VLAN',
        note: 'Untuk memisahkan jaringan server yang berbeda.',
        explain: 'Memberi sekat pada switch ruang server: VLAN 10 untuk server aplikasi, VLAN 20 untuk server database, dst.',
      },
      {
        command: 'show vlan',
        title: '9. Lihat daftar VLAN',
        explain: 'Menampilkan sekat-sekat yang sudah dibuat.',
      },
      {
        command: 'ip name-server 8.8.8.8',
        title: '10. Atur DNS',
        explain: 'Memberi tahu switch buku telepon internet yang dipakai.',
      },
      {
        command: 'exit',
        title: '11. Keluar dari mode pengaturan',
        explain: 'Selesai, kembali ke prompt utama.',
      },
      {
        command: 'ping 10.0.0.1',
        title: '12. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'juniper',
    label: 'Juniper JunOS',
    intro: 'JunOS memakai cara "set & commit": ketik perintah set, lalu commit agar aktif. Seperti menulis draf dulu, baru tombol "simpan & terbitkan".',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DNS', 'BGP', 'OSPF', 'Firewall (SRX)'],
    steps: [
      {
        command: 'show interfaces terse',
        title: '1. Lihat daftar port',
        note: 'Cari nama interface (ge-0/0/0, ge-0/0/1, xe-0/0/0, dst).',
        explain: 'Daftar lubang kabel. Di Juniper namanya unik: ge-0/0/0 artinya port ethernet (ge) di slot 0, panel 0, lubang 0.',
      },
      {
        command: 'configure',
        title: '2. Masuk mode pengaturan',
        note: 'Prompt berubah menjadi admin@JunOS#.',
        explain: 'Masuk mode menulis draf. Belum ada yang berubah sungguhan sampai kamu commit nanti.',
      },
      {
        command: 'set system host-name R1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan pada perangkat di dalam draf.',
      },
      {
        command: 'set interfaces ge-0/0/1 unit 0 family inet address 172.16.0.2/30',
        title: '4. Set IP pada port',
        note: 'Ganti ge-0/0/1 dan IP dengan milikmu.',
        explain: 'Menulis di draf: port ge-0/0/1 akan diberi alamat 172.16.0.2. /30 = kompleks super kecil yang cukup untuk 2 perangkat (biasanya untuk kabel antar-router).',
      },
      {
        command: 'set system name-server 8.8.8.8',
        title: '5. Atur DNS',
        explain: 'Menulis di draf: buku telepon internet yang dipakai adalah 8.8.8.8.',
      },
      {
        command: 'set vlans LAN10 vlan-id 10',
        title: '6. Buat VLAN',
        note: 'Khusus switch Juniper (EX series).',
        explain: 'Menulis di draf: buat sekat bernama LAN10 dengan nomor 10.',
      },
      {
        command: 'set routing-options static route 0.0.0.0/0 next-hop 10.0.0.1',
        title: '7. Set jalan keluar (rute static)',
        note: 'next-hop = IP gateway ke jaringan lain.',
        explain: 'Menulis di draf: paket ke alamat asing dikirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'commit',
        title: '8. Terbitkan perubahan (commit)',
        note: 'TANPA COMMIT, perubahan TIDAK aktif!',
        explain: 'Ini tombol "terbitkan". Semua yang kamu tulis di draf baru benar-benar dipakai setelah commit. Kalau lupa commit, rasanya seperti sudah mengetik panjang tapi lupa menyimpan file.',
      },
      {
        command: 'exit',
        title: '9. Kembali ke mode operasional',
        explain: 'Keluar dari mode draf, kembali ke mode menonton.',
      },
      {
        command: 'show route',
        title: '10. Lihat tabel rute',
        explain: 'Menampilkan peta jalan keluar yang sudah diterbitkan.',
      },
      {
        command: 'ping 172.16.0.1',
        title: '11. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab ketukanmu.',
      },
    ],
  },
  {
    vendorId: 'huawei',
    label: 'Huawei VRP',
    intro: 'Huawei memakai system-view → pilih interface → kasih IP. Mirip Cisco tapi dengan nama perintah khas China: display, system-view, sysname.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DNS', 'DHCP', 'OSPF', 'BGP'],
    steps: [
      {
        command: 'display ip interface brief',
        title: '1. Lihat daftar port',
        note: 'Cari nama interface (GigabitEthernet0/0/0, dst).',
        explain: 'Daftar lubang kabel. Huawei menamainya GigabitEthernet0/0/0 — slot 0, panel 0, lubang 0.',
      },
      {
        command: 'system-view',
        title: '2. Masuk mode pengaturan',
        note: 'Prompt berubah menjadi [Huawei].',
        explain: 'Masuk dapur pengaturan. Prompt dengan tanda [ ] menandakan kamu sudah di dalam.',
      },
      {
        command: 'sysname R1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan, misalnya R1.',
      },
      {
        command: 'interface GigabitEthernet0/0/1',
        title: '4. Pilih port',
        note: 'Ganti dengan nama port di perangkatmu.',
        explain: 'Memilih lubang kabel yang mau diberi alamat.',
      },
      {
        command: 'ip address 10.0.0.3 255.255.255.252',
        title: '5. Beri IP + netmask',
        note: 'Format: ip address IP NETMASK. 255.255.255.252 = /30.',
        explain: 'Memberi alamat pada port. Netmask 255.255.255.252 = kompleks super kecil untuk 2 perangkat (kabel antar-router).',
      },
      {
        command: 'quit',
        title: '6. Keluar dari mode port',
        explain: 'Kembali ke mode system view.',
      },
      {
        command: 'vlan 10',
        title: '7. Buat VLAN (khusus switch)',
        explain: 'Memberi sekat pada switch: VLAN 10 untuk satu departemen.',
      },
      {
        command: 'dns server 8.8.8.8',
        title: '8. Atur DNS',
        explain: 'Memberi tahu perangkat buku telepon internet yang dipakai.',
      },
      {
        command: 'ip route-static 0.0.0.0 0.0.0.0 10.0.0.1',
        title: '9. Tambah jalan keluar',
        note: 'Format: ip route-static TUJUAN NETMASK GATEWAY.',
        explain: 'Paket ke alamat asing dikirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'quit',
        title: '10. Kembali ke mode user',
        explain: 'Keluar dari dapur, kembali ke mode menonton.',
      },
      {
        command: 'display ip interface brief',
        title: '11. Cek semua IP',
        explain: 'Lihat hasil: port mana yang sudah dapat alamat.',
      },
      {
        command: 'ping 10.0.0.1',
        title: '12. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'ubiquiti',
    label: 'Ubiquiti EdgeOS',
    intro: 'EdgeOS (punya Ubiquiti/EdgeRouter) memakai set & commit seperti Juniper dan VyOS.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DNS', 'NAT'],
    steps: [
      {
        command: 'show interfaces',
        title: '1. Lihat daftar port',
        explain: 'Daftar lubang kabel di EdgeRouter. Port biasanya bernama eth0, eth1, dst.',
      },
      {
        command: 'configure',
        title: '2. Masuk mode pengaturan',
        explain: 'Masuk mode draf — belum ada yang berubah sampai commit.',
      },
      {
        command: 'set system host-name ER1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan, misalnya ER1 (EdgeRouter 1).',
      },
      {
        command: 'set interfaces ethernet eth0 address 192.168.1.1/24',
        title: '4. Set IP pada port',
        note: 'Ganti eth0 dengan nama port di perangkatmu.',
        explain: 'Menulis di draf: port eth0 diberi alamat 192.168.1.1. /24 = satu kompleks kecil.',
      },
      {
        command: 'set system name-server 8.8.8.8',
        title: '5. Atur DNS',
        explain: 'Menulis di draf: buku telepon internet yang dipakai adalah 8.8.8.8.',
      },
      {
        command: 'set vlans LAN10 vlan-id 10',
        title: '6. Buat VLAN',
        explain: 'Memberi sekat pada jaringan.',
      },
      {
        command: 'set protocols static route 0.0.0.0/0 next-hop 10.0.0.1',
        title: '7. Set jalan keluar',
        explain: 'Paket ke alamat asing dikirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'commit',
        title: '8. Terbitkan perubahan',
        note: 'Tanpa commit, perubahan belum aktif.',
        explain: 'Tombol "simpan & terbitkan" — perubahan baru dipakai setelah ini.',
      },
      {
        command: 'show ip route',
        title: '9. Lihat tabel rute',
        explain: 'Menampilkan peta jalan keluar.',
      },
      {
        command: 'ping 192.168.1.2',
        title: '10. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'vyos',
    label: 'VyOS',
    intro: 'VyOS adalah router open-source yang cara pakainya mirip EdgeOS: set & commit. Sering dipakai di lab dan cloud karena gratis.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DNS', 'NAT', 'Firewall'],
    steps: [
      {
        command: 'show interfaces',
        title: '1. Lihat daftar port',
        explain: 'Daftar lubang kabel di router VyOS.',
      },
      {
        command: 'configure',
        title: '2. Masuk mode pengaturan',
        explain: 'Masuk mode draf.',
      },
      {
        command: 'set system host-name R1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan.',
      },
      {
        command: 'set interfaces ethernet eth0 address 192.168.1.1/24',
        title: '4. Set IP pada port',
        note: 'Ganti eth0 dengan nama port di perangkatmu.',
        explain: 'Menulis di draf: port eth0 diberi alamat 192.168.1.1.',
      },
      {
        command: 'set system name-server 8.8.8.8',
        title: '5. Atur DNS',
        explain: 'Menulis di draf: buku telepon internet 8.8.8.8.',
      },
      {
        command: 'set vlans LAN10 vlan-id 10',
        title: '6. Buat VLAN',
        explain: 'Memberi sekat pada jaringan.',
      },
      {
        command: 'set protocols static route 0.0.0.0/0 next-hop 10.0.0.1',
        title: '7. Set jalan keluar',
        explain: 'Paket ke alamat asing dikirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'commit',
        title: '8. Terbitkan perubahan',
        note: 'Tanpa commit, perubahan belum aktif.',
        explain: 'Tombol "simpan & terbitkan".',
      },
      {
        command: 'show ip route',
        title: '9. Lihat tabel rute',
        explain: 'Menampilkan peta jalan keluar.',
      },
      {
        command: 'ping 192.168.1.2',
        title: '10. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'fortinet',
    label: 'Fortinet FortiOS',
    intro: 'FortiOS (firewall FortiGate) memakai cara: config → edit → set. Firewall adalah "satpam" jaringan: mengatur siapa boleh keluar-masuk.',
    capabilities: ['IP & interface', 'Hostname', 'Firewall policy', 'Routing', 'NAT (via policy)'],
    steps: [
      {
        command: 'get system interface',
        title: '1. Lihat daftar port',
        note: 'Cari nama port (port1, port2, wan1, dst).',
        explain: 'Daftar lubang kabel di firewall. Biasanya port1 untuk LAN (dalam) dan wan1 untuk internet (luar).',
      },
      {
        command: 'config system global',
        title: '2. Masuk pengaturan umum',
        explain: 'Tempat mengubah setelan dasar perangkat.',
      },
      {
        command: 'set hostname FW1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan, misalnya FW1 (Firewall 1).',
      },
      {
        command: 'end',
        title: '4. Keluar dari pengaturan umum',
        explain: 'Selesai mengubah setelan dasar.',
      },
      {
        command: 'config system interface',
        title: '5. Masuk menu pengaturan port',
        explain: 'Pintu masuk untuk mengubah alamat port-port.',
      },
      {
        command: 'edit port1',
        title: '6. Pilih port',
        note: 'Ganti port1 dengan nama port di perangkatmu.',
        explain: 'Memilih lubang kabel yang mau diberi alamat.',
      },
      {
        command: 'set ip 192.168.1.1 255.255.255.0',
        title: '7. Set IP + netmask',
        note: 'Format: set ip IP NETMASK.',
        explain: 'Memberi alamat pada port. 255.255.255.0 = /24 (satu kompleks kecil).',
      },
      {
        command: 'next',
        title: '8. Simpan perubahan port ini',
        explain: 'Selesai dengan port ini, lanjut ke port lain (atau keluar).',
      },
      {
        command: 'end',
        title: '9. Keluar dari menu port',
        explain: 'Kembali ke mode utama.',
      },
      {
        command: 'config firewall policy',
        title: '10. Masuk menu aturan firewall',
        explain: 'Firewall itu seperti satpam: di menu ini kamu menulis aturan "siapa boleh lewat". Misalnya: orang dari LAN boleh keluar ke internet.',
      },
      {
        command: 'edit 1',
        title: '11. Buat aturan nomor 1',
        explain: 'Membuka lembar aturan pertama untuk diisi.',
      },
      {
        command: 'set srcintf port1',
        title: '12. Sumber: dari port mana',
        note: 'Ganti port1 dengan port LAN-mu.',
        explain: 'Aturan ini berlaku untuk orang yang masuk dari port1 (jaringan dalam).',
      },
      {
        command: 'set dstintf wan1',
        title: '13. Tujuan: ke port mana',
        note: 'Ganti wan1 dengan port internet-mu.',
        explain: 'Mereka boleh keluar lewat wan1 (internet).',
      },
      {
        command: 'set action accept',
        title: '14. Izinkan',
        explain: 'Aturannya: "IZINKAN" (bukan blokir).',
      },
      {
        command: 'end',
        title: '15. Terapkan aturan',
        explain: 'Simpan dan tutup menu aturan.',
      },
      {
        command: 'execute ping 192.168.1.2',
        title: '16. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'aruba',
    label: 'Aruba ArubaOS-CX',
    intro: 'ArubaOS-CX (switch HP Aruba) cara pakainya mirip Cisco IOS: interface → ip address → no shutdown.',
    capabilities: ['IP & interface', 'VLAN', 'Hostname', 'DNS', 'DHCP server', 'Routing'],
    steps: [
      {
        command: 'show interface brief',
        title: '1. Lihat daftar port',
        note: 'Cari nama interface (1/1/1, 1/1/2, dst).',
        explain: 'Daftar lubang kabel. Aruba memakai format 1/1/1 — member 1, panel 1, lubang 1.',
      },
      {
        command: 'configure terminal',
        title: '2. Masuk mode pengaturan',
        explain: 'Masuk dapur pengaturan.',
      },
      {
        command: 'hostname SW1',
        title: '3. Ganti nama perangkat',
        explain: 'Memberi nama panggilan, misalnya SW1 (Switch 1).',
      },
      {
        command: 'interface 1/1/1',
        title: '4. Pilih port',
        note: 'Ganti 1/1/1 dengan nama port di perangkatmu.',
        explain: 'Memilih lubang kabel yang mau diberi alamat.',
      },
      {
        command: 'ip address 10.0.0.2/24',
        title: '5. Beri IP (format CIDR)',
        explain: 'Memberi alamat pada port. /24 = satu kompleks kecil.',
      },
      {
        command: 'no shutdown',
        title: '6. Nyalakan port',
        explain: 'Menyalakan lampu port yang tadinya mati.',
      },
      {
        command: 'exit',
        title: '7. Keluar dari mode port',
        explain: 'Kembali ke mode global.',
      },
      {
        command: 'vlan 10',
        title: '8. Buat VLAN',
        explain: 'Memberi sekat pada switch untuk memisahkan jaringan.',
      },
      {
        command: 'ip name-server 8.8.8.8',
        title: '9. Atur DNS',
        explain: 'Memberi tahu switch buku telepon internet yang dipakai.',
      },
      {
        command: 'ip dhcp pool LAN',
        title: '10. Buat kolam IP otomatis',
        note: 'Lanjutkan dengan "network" dan "default-router".',
        explain: 'Membuka layanan petugas parkir: perangkat yang colok diberi IP otomatis.',
      },
      {
        command: 'exit',
        title: '11. Keluar dari mode pengaturan',
        explain: 'Selesai, kembali ke prompt utama.',
      },
      {
        command: 'ping 10.0.0.1',
        title: '12. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'openwrt',
    label: 'OpenWrt',
    intro: 'OpenWrt adalah Linux kecil untuk router rumahan. Memakai perintah Linux (ip) dan UCI untuk menyimpan pengaturan.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'VLAN', 'DHCP (via UCI)', 'DNS'],
    steps: [
      {
        command: 'ip addr',
        title: '1. Lihat daftar port & IP',
        explain: 'Daftar lubang kabel beserta alamatnya. Perhatikan bagian "inet" — itu alamat IP yang sedang dipakai.',
      },
      {
        command: 'ip addr add 192.168.1.1/24 dev eth0',
        title: '2. Beri IP pada port',
        note: 'Ganti eth0 dengan nama interface di perangkatmu.',
        explain: 'Memberi alamat 192.168.1.1 ke port eth0. /24 = satu kompleks kecil.',
      },
      {
        command: 'uci set system.@system[0].hostname=router1',
        title: '3. Ganti nama perangkat',
        note: 'UCI = sistem penyimpanan pengaturan OpenWrt.',
        explain: 'UCI itu seperti buku catatan pengaturan. Perintah ini menulis "nama perangkat: router1" ke buku catatan.',
      },
      {
        command: 'uci set network.vlan10.vlan=10',
        title: '4. Buat VLAN',
        note: 'Lanjutkan dengan "uci commit network".',
        explain: 'Menulis di buku catatan: buat sekat jaringan nomor 10 bernama vlan10.',
      },
      {
        command: 'uci commit',
        title: '5. Simpan semua perubahan UCI',
        note: 'Tanpa commit, perubahan hanya di memori dan hilang saat reboot.',
        explain: 'Menandatangani buku catatan — perubahan baru benar-benar tersimpan. Kalau lupa, saat router mati, semua setelan hilang.',
      },
      {
        command: 'ip route add default via 10.0.0.1',
        title: '6. Tambah jalan keluar',
        explain: 'Paket ke alamat asing dikirim lewat pintu 10.0.0.1.',
      },
      {
        command: 'uci show network',
        title: '7. Lihat pengaturan jaringan',
        explain: 'Membaca kembali buku catatan pengaturan jaringan.',
      },
      {
        command: 'ping 192.168.1.2',
        title: '8. Uji koneksi',
        explain: 'Tes apakah tetangga menjawab.',
      },
    ],
  },
  {
    vendorId: 'linux',
    label: 'Debian Linux (Server/PC)',
    intro: 'PC dan Server memakai Linux: perintah ip addr, ip route, dan file konfigurasi di /etc. Ini yang paling dekat dengan komputer biasa.',
    capabilities: ['IP & interface', 'Routing', 'Hostname', 'DNS (resolv.conf)', 'Port checking', 'Proses & resource'],
    steps: [
      {
        command: 'ip addr',
        title: '1. Lihat daftar port & IP',
        explain: 'Daftar lubang kabel (eth0, eth1) beserta alamatnya. Bagian "inet" adalah alamat IP, "link/ether" adalah alamat MAC (ID unik perangkat).',
      },
      {
        command: 'ip addr add 192.168.1.10/24 dev eth0',
        title: '2. Beri IP pada port',
        note: 'Ganti eth0 dengan nama interface di perangkatmu.',
        explain: 'Memberi alamat 192.168.1.10 ke port eth0. /24 = satu kompleks kecil.',
      },
      {
        command: 'hostname server1',
        title: '3. Ganti nama server',
        note: 'Agar permanen, edit /etc/hostname.',
        explain: 'Memberi nama panggilan pada server. Akan hilang saat reboot kecuali disimpan di file /etc/hostname.',
      },
      {
        command: 'ip route add default via 192.168.1.1',
        title: '4. Tambah gerbang (gateway)',
        note: 'Tanpa gateway, host tidak bisa keluar ke subnet lain.',
        explain: 'Memberi tahu server: kalau mau kirim data ke luar kompleks, lewat pintu 192.168.1.1. Tanpa ini, server hanya bisa bicara dengan tetangga satu kompleks.',
      },
      {
        command: 'ip route',
        title: '5. Lihat tabel rute',
        explain: 'Menampilkan peta jalan keluar server.',
      },
      {
        command: 'dhclient eth1',
        title: '5b. Minta IP otomatis (DHCP client, opsional)',
        note: 'Ganti eth1 dengan interface yang menghadap DHCP server.',
        explain: 'Daripada set IP manual, server bisa meminta alamat ke petugas parkir (DHCP server) di segmen yang sama — seperti menyewa kamar. Gateway ikut terisi otomatis. Cek hasilnya dengan ip addr: akan muncul "inet" baru di interface itu.',
      },
      {
        command: 'cat /etc/resolv.conf',
        title: '6. Lihat DNS server',
        explain: 'Membaca file berisi buku telepon internet yang dipakai server.',
      },
      {
        command: 'ss -tulnp',
        title: '7. Lihat port yang terbuka',
        explain: 'Seperti melihat pintu mana saja yang terbuka di server — penting untuk tahu layanan apa yang melayani tamu.',
      },
      {
        command: 'systemctl status nginx',
        title: '8. Cek status layanan web',
        note: 'Ganti nginx dengan nama layanan lain (ssh, docker, dst).',
        explain: 'Cek apakah "toko" website bernama nginx sedang buka atau tutup.',
      },
      {
        command: 'free -h',
        title: '9. Lihat pemakaian RAM',
        explain: 'Menunjukkan kapasitas "memori kerja" server dan sisanya.',
      },
      {
        command: 'df -h',
        title: '10. Lihat kapasitas disk',
        explain: 'Menunjukkan kapasitas "lemari penyimpanan" server.',
      },
      {
        command: 'ping 192.168.1.1',
        title: '11. Uji koneksi',
        explain: 'Tes apakah tetangga (gerbang) menjawab.',
      },
    ],
  },
];

/** Ambil panduan untuk satu vendor (fallback ke MikroTik bila tidak ada). */
export function getBeginnerGuide(vendorId: string): VendorGuide {
  return (
    BEGINNER_GUIDES.find((g) => g.vendorId === vendorId) ||
    BEGINNER_GUIDES.find((g) => g.vendorId === 'mikrotik')!
  );
}
