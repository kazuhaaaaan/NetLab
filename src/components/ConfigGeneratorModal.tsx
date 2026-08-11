import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Download, RefreshCw, Sparkles, Radio, FileCode2 } from 'lucide-react';
import { generateConfig, type ConfigGeneratorParams } from '../utils/configGenerator';
import {
  validateHostname,
  validateIpv4,
  validateIpv4Cidr,
  validateVlanId,
  validateGatewayInSubnet,
  findSubnetOverlap,
  type ValidationResult,
} from '../utils/validation';

interface ConfigGeneratorModalProps {
  open: boolean;
  onClose: () => void;
}

/** Pesan error real-time per field (Tugas 2 — validasi form). */
interface FieldErrors {
  hostname: string | null;
  wanIp: string | null;
  wanGateway: string | null;
  lanSubnet: string | null;
  lanGatewayIp: string | null;
  dhcpPoolRange: string | null;
  vlanErrors: Record<number, string | null>;
}

const emptyErrors = (): FieldErrors => ({
  hostname: null,
  wanIp: null,
  wanGateway: null,
  lanSubnet: null,
  lanGatewayIp: null,
  dhcpPoolRange: null,
  vlanErrors: {},
});

/** Validasi pool DHCP "a.b.c.d-a.b.c.d" ringkas (cek kedua ujung IP). */
function validatePoolRange(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Rentang pool DHCP wajib diisi.';
  const parts = t.split('-').map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 'Format rentang: 192.168.1.100-192.168.1.200';
  }
  const ipErr = validateIpv4(parts[0]);
  if (ipErr) return 'Awal rentang: ' + ipErr.toLowerCase();
  const ipErr2 = validateIpv4(parts[1]);
  if (ipErr2) return 'Akhir rentang: ' + ipErr2.toLowerCase();
  return null;
}

const FieldInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}> = ({ label, value, onChange, error, placeholder, mono, type }) => (
  <div>
    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
      {label}
    </label>
    <input
      type={type ?? 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-[#0B0C0E] border rounded-md px-2.5 py-1.5 text-xs outline-none transition-colors ${
        mono ? 'font-mono' : ''
      } ${
        error
          ? 'border-rose-500/70 focus:border-rose-400'
          : 'border-[#2B2D31] focus:border-blue-500/70'
      } text-slate-100 placeholder-slate-600`}
    />
    {error && (
      <p className="mt-1 text-[10.5px] text-rose-400 flex items-start gap-1">
        <span className="mt-0.5 shrink-0">⚠</span>
        <span>{error}</span>
      </p>
    )}
  </div>
);

/** Highlight CLI sederhana: komentar, perintah pertama, key=value. */
const HighlightedCode: React.FC<{ code: string }> = ({ code }) => {
  const parts = useMemo(() => {
    return code.split('\n').map((line, i) => {
      let node: React.ReactNode = <span className="text-slate-300">{line}</span>;
      if (line.startsWith('#') || line.startsWith('!')) {
        node = <span className="text-slate-500 italic">{line}</span>;
      } else {
        const trimmed = line.trimStart();
        const indent = line.slice(0, line.length - trimmed.length);
        const cmdMatch = trimmed.match(/^(\/?[a-z-]+(?:\s[a-z0-9-]+)*)/i);
        if (cmdMatch && cmdMatch[0].trim()) {
          const cmd = cmdMatch[0];
          const rest = trimmed.slice(cmd.length);
          const kv = rest.split(/\s+/).filter(Boolean);
          node = (
            <>
              {indent}
              <span className="text-sky-400 font-semibold">{cmd}</span>
              {kv.map((token, j) => (
                <span key={j} className={token.includes('=') ? 'text-amber-300' : 'text-slate-300'}>
                  {' '}{token}
                </span>
              ))}
            </>
          );
        }
      }
      return (
        <div key={i} className="whitespace-pre-wrap break-all">
          {node}
        </div>
      );
    });
  }, [code]);
  return <pre className="text-[11px] leading-relaxed font-mono">{parts}</pre>;
};

export const ConfigGeneratorModal: React.FC<ConfigGeneratorModalProps> = ({ open, onClose }) => {
  const [vendor, setVendor] = useState<ConfigGeneratorParams['vendor']>('mikrotik');
  const [hostname, setHostname] = useState('Router-Utama');
  const [wanIface, setWanIface] = useState('ether1');
  const [wanIp, setWanIp] = useState('203.0.113.2/30');
  const [wanGateway, setWanGateway] = useState('203.0.113.1');
  const [lanSubnet, setLanSubnet] = useState('192.168.1.0/24');
  const [lanGatewayIp, setLanGatewayIp] = useState('192.168.1.1');
  const [dhcpPoolRange, setDhcpPoolRange] = useState('192.168.1.100-192.168.1.200');
  const [dnsServers, setDnsServers] = useState('8.8.8.8,1.1.1.1');
  const [vlans, setVlans] = useState<{ id: number; name: string }[]>([]);
  const [vlanInputId, setVlanInputId] = useState('');
  const [vlanInputName, setVlanInputName] = useState('');
  const [enableNat, setEnableNat] = useState(true);
  const [enableFirewall, setEnableFirewall] = useState(true);
  const [routing, setRouting] = useState<'static' | 'ospf'>('static');
  const [lanIface, setLanIface] = useState('ether2');

  const [errors, setErrors] = useState<FieldErrors>(emptyErrors());
  const [copied, setCopied] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);

  // Validasi real-time setiap field berubah
  const updateField = (key: keyof FieldErrors, value: string, validator: (v: string) => string | null) => {
    setErrors((prev) => ({ ...prev, [key]: validator(value) }));
  };

  // Cross-field: gateway harus satu subnet dengan IP WAN, dan LAN tidak boleh
  // tumpang tindih dengan subnet WAN (validasi jaringan, bukan hanya format).
  const gatewayErr =
    wanIp && wanGateway ? validateGatewayInSubnet(wanGateway, wanIp) : null;
  const overlapErr =
    wanIp && lanSubnet ? findSubnetOverlap(wanIp, [lanSubnet]) : null;

  const params: ConfigGeneratorParams = {
    vendor,
    hostname: hostname.trim() || 'Router-Utama',
    wanIface,
    wanIp,
    wanGateway,
    lanSubnet,
    lanGatewayIp,
    dhcpPoolRange,
    dnsServers: dnsServers.split(',').map((s) => s.trim()).filter(Boolean),
    vlans,
    enableNat,
    enableFirewall,
    routing,
    lanIface,
  };

  const generated = useMemo(() => generateConfig(params), [params]);

  // Form valid & boleh generate?
  const hasErrors =
    errors.hostname ||
    errors.wanIp ||
    errors.wanGateway ||
    errors.lanSubnet ||
    errors.lanGatewayIp ||
    errors.dhcpPoolRange ||
    gatewayErr ||
    overlapErr ||
    vlans.some((v) => errors.vlanErrors[v.id]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generated.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Salin script ini:', generated.content);
    }
  };

  const downloadScript = () => {
    const blob = new Blob([generated.content], {
      type: vendor === 'mikrotik' ? 'text/plain' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generated.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const addVlan = () => {
    const err = validateVlanId(vlanInputId);
    if (err) {
      setErrors((prev) => ({ ...prev, vlanErrors: { ...prev.vlanErrors, [-1]: err } }));
      return;
    }
    const id = parseInt(vlanInputId, 10);
    const name = vlanInputName.trim() || `VLAN${id}`;
    if (vlans.some((v) => v.id === id)) {
      setErrors((prev) => ({ ...prev, vlanErrors: { ...prev.vlanErrors, [id]: 'VLAN ID sudah ada di daftar.' } }));
      return;
    }
    setVlans((prev) => [...prev, { id, name }]);
    setErrors((prev) => ({ ...prev, vlanErrors: { ...prev.vlanErrors, [id]: null, [-1]: null } }));
    setVlanInputId('');
    setVlanInputName('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-[#0F1015] border border-[#2B2D31] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Automatic Router Config Generator</h2>
              <p className="text-[10px] text-slate-500 font-mono">
                MikroTik RouterOS (.rsc) · Cisco IOS (.txt) — murni client-side
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-2">
          {/* ── Form ── */}
          <div className="p-4 space-y-3.5 border-r border-[#2B2D31]">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Vendor / Platform
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setVendor('mikrotik')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-[11px] font-semibold transition ${
                    vendor === 'mikrotik'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" /> MikroTik RouterOS
                </button>
                <button
                  onClick={() => setVendor('cisco')}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-[11px] font-semibold transition ${
                    vendor === 'cisco'
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" /> Cisco IOS
                </button>
              </div>
            </div>

            <FieldInput
              label="Hostname Router"
              value={hostname}
              onChange={(v) => {
                setHostname(v);
                updateField('hostname', v, validateHostname);
              }}
              error={errors.hostname}
              mono
            />

            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="Interface WAN" value={wanIface} onChange={setWanIface} mono />
              <FieldInput
                label="IP WAN (CIDR)"
                value={wanIp}
                onChange={(v) => {
                  setWanIp(v);
                  updateField('wanIp', v, validateIpv4Cidr);
                }}
                error={errors.wanIp}
                mono
              />
            </div>

            <FieldInput
              label="IP Gateway (upstream ISP)"
              value={wanGateway}
              onChange={(v) => {
                setWanGateway(v);
                updateField('wanGateway', v, validateIpv4);
              }}
              error={errors.wanGateway ?? gatewayErr}
              mono
            />

            <div className="grid grid-cols-2 gap-2">
              <FieldInput
                label="Subnet LAN"
                value={lanSubnet}
                onChange={(v) => {
                  setLanSubnet(v);
                  updateField('lanSubnet', v, validateIpv4Cidr);
                }}
                error={errors.lanSubnet ?? overlapErr}
                mono
              />
              <FieldInput
                label="IP LAN Router"
                value={lanGatewayIp}
                onChange={(v) => {
                  setLanGatewayIp(v);
                  updateField('lanGatewayIp', v, validateIpv4);
                }}
                error={errors.lanGatewayIp}
                mono
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldInput
                label="Rentang Pool DHCP"
                value={dhcpPoolRange}
                onChange={(v) => {
                  setDhcpPoolRange(v);
                  updateField('dhcpPoolRange', v, validatePoolRange);
                }}
                error={errors.dhcpPoolRange}
                mono
              />
              <FieldInput
                label="DNS Servers (koma)"
                value={dnsServers}
                onChange={(v) => {
                  setDnsServers(v);
                  updateField('wanGateway', v, (val) => {
                    const all = val.split(',').map((s) => s.trim()).filter(Boolean);
                    if (all.length === 0) return 'Minimal satu DNS server.';
                    for (const d of all) {
                      const e = validateIpv4(d);
                      if (e) return e;
                    }
                    return null;
                  });
                }}
                error={null}
                mono
              />
            </div>

            {/* VLAN list */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Daftar VLAN (opsional — router-on-a-stick)
              </label>
              <div className="flex gap-1.5">
                <input
                  value={vlanInputId}
                  onChange={(e) => setVlanInputId(e.target.value)}
                  placeholder="ID (1-4094)"
                  inputMode="numeric"
                  className="w-24 bg-[#0B0C0E] border border-[#2B2D31] rounded-md px-2 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500/70"
                />
                <input
                  value={vlanInputName}
                  onChange={(e) => setVlanInputName(e.target.value)}
                  placeholder="Nama VLAN (mis. Marketing)"
                  className="flex-1 min-w-0 bg-[#0B0C0E] border border-[#2B2D31] rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-blue-500/70"
                />
                <button
                  onClick={addVlan}
                  className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shrink-0 transition"
                >
                  + Tambah
                </button>
              </div>
              {errors.vlanErrors[-1] && (
                <p className="mt-1 text-[10.5px] text-rose-400">⚠ {errors.vlanErrors[-1]}</p>
              )}
              {vlans.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vlans.map((v) => (
                    <span
                      key={v.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-900/30 border border-emerald-700/50 text-emerald-300 text-[10px] font-mono"
                    >
                      VLAN {v.id} · {v.name}
                      <button
                        onClick={() => {
                          setVlans((prev) => prev.filter((x) => x.id !== v.id));
                          setErrors((prev) => {
                            const next = { ...prev.vlanErrors };
                            delete next[v.id];
                            return { ...prev, vlanErrors: next };
                          });
                        }}
                        className="text-emerald-500 hover:text-rose-400 transition"
                        title="Hapus VLAN"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#1A1D24] border border-[#2B2D31] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableNat}
                  onChange={(e) => setEnableNat(e.target.checked)}
                  className="accent-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] text-slate-300 font-medium">NAT / Firewall : NAT</span>
              </label>
              <label className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[#1A1D24] border border-[#2B2D31] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableFirewall}
                  onChange={(e) => setEnableFirewall(e.target.checked)}
                  className="accent-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] text-slate-300 font-medium">Filter WAN</span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                Routing Dynamic
              </label>
              <select
                value={routing}
                onChange={(e) => setRouting(e.target.value as 'static' | 'ospf')}
                className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500/70"
              >
                <option value="static">Static Route (default ke ISP)</option>
                <option value="ospf">OSPF Single Area 0</option>
              </select>
            </div>
          </div>

          {/* ── Output preview ── */}
          <div className="flex flex-col min-h-0">
            <div className="px-4 py-2.5 border-b border-[#2B2D31] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  Output · {generated.filename}
                </span>
                <button
                  onClick={() => setViewRaw((v) => !v)}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold border transition ${
                    viewRaw
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-[#1A1D24] border-[#2B2D31] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {viewRaw ? 'Highlight' : 'RAW'}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition"
                  title="Salin script ke clipboard"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Tersalin!' : 'Copy Code'}
                </button>
                <button
                  onClick={downloadScript}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold transition"
                  title={`Unduh ${generated.filename}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#07080A] p-3 min-h-[220px]">
              {hasErrors ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <RefreshCw className="w-8 h-8 text-rose-500/60 mb-2" />
                  <p className="text-xs text-slate-400 font-medium">
                    Perbaiki error form di panel kiri untuk melihat skrip.
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1 font-mono">
                    {errors.hostname || errors.wanIp || errors.wanGateway || errors.lanSubnet || errors.lanGatewayIp || errors.dhcpPoolRange || 'VLAN ID tidak valid'}
                  </p>
                </div>
              ) : viewRaw ? (
                <pre className="text-[11px] leading-relaxed font-mono text-slate-200 whitespace-pre-wrap break-all select-text">{generated.content}</pre>
              ) : (
                <HighlightedCode code={generated.content} />
              )}
            </div>

            <div className="px-4 py-2 border-t border-[#2B2D31] text-[9.5px] font-mono text-slate-600 shrink-0 select-text">
              Tip: pada MikroTik muat via <span className="text-emerald-400">/import file-name={generated.filename}</span> · pada Cisco tempel di mode <span className="text-emerald-400">configure terminal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};