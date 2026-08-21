import { CLIParser } from '../../../cli/src/index';
import type { NormalizedCommand } from '../../../cli/src/index';
import type { VendorAdapter as _IV, NodeMemory, VendorContext, CommandResult, MemoryRegistry } from '../common/types';
import { portLinksOf } from '../common/state';
import { runChain } from '../common/chain';
import { unknownCommand, knownUnsupported } from '../common/errors';
import { MemoryRegistryImpl } from '../common/memory';
import { generateRunningConfig } from '../common/format';
import { getVendorCapabilities, VendorCapabilities } from '../capabilities';
import { MikroTikVendorAdapter } from '../mikrotik/adapter';
import { CiscoVendorAdapter } from '../cisco-ios/adapter';
import { CiscoNxosVendorAdapter } from '../cisco-nxos/adapter';
import { JuniperVendorAdapter } from '../juniper/adapter';
import { HuaweiVendorAdapter } from '../huawei/adapter';
import { UbiquitiVendorAdapter } from '../ubiquiti/adapter';
import { VyosVendorAdapter } from '../vyos/adapter';
import { FortinetVendorAdapter } from '../fortinet/adapter';
import { ArubaVendorAdapter } from '../aruba/adapter';
import { OpenwrtVendorAdapter } from '../openwrt/adapter';
import { LinuxDebianVendorAdapter } from '../linux/adapter';
import { WindowsVendorAdapter } from '../windows/adapter';

// ============================================================
// VendorDispatcher — ROUTER MURNI.
//
// Tidak lagi berisi if-else raksasa: setiap branch lama hidup di
// common/generic.ts + <vendor>/commands.ts sebagai ChainEntry, dan
// dieksekusi oleh common/chain.ts (runChain). Dispatcher hanya:
//   1. lookup adapter + node memory
//   2. dekorasi portLinks
//   3. parse input → normalized
//   4. jalankan chain (urutan = posisi asli di if-else lama)
//   5. fallback unknown/unsupported + formatResponse + hook simulator
// ============================================================
export class VendorDispatcher {
  private adapters: Map<string, _IV> = new Map();
  private registry: MemoryRegistryImpl = new MemoryRegistryImpl();

  constructor() {
    this.register(new MikroTikVendorAdapter());
    this.register(new CiscoVendorAdapter());
    this.register(new CiscoNxosVendorAdapter());
    this.register(new JuniperVendorAdapter());
    this.register(new HuaweiVendorAdapter());
    this.register(new UbiquitiVendorAdapter());
    this.register(new VyosVendorAdapter());
    this.register(new FortinetVendorAdapter());
    this.register(new ArubaVendorAdapter());
    this.register(new OpenwrtVendorAdapter());
    this.register(new LinuxDebianVendorAdapter());
    this.register(new WindowsVendorAdapter());
  }

  register(adapter: _IV) {
    this.adapters.set(adapter.vendorId, adapter);
  }

  getAdapter(vendorId: string): _IV | undefined {
    return this.adapters.get(vendorId);
  }

  /** Kapabilitas terverifikasi sebuah vendor (registry tunggal — lihat capabilities.ts). */
  capabilities(vendorId: string): VendorCapabilities | null {
    return getVendorCapabilities(vendorId);
  }

  getNodeMemory(nodeId: string): NodeMemory {
    return this.registry.getNodeMemory(nodeId);
  }

  forgetNodeMemory(nodeId: string): void {
    this.registry.forgetNodeMemory(nodeId);
  }

  setNodeModelLabel(nodeId: string, label: string): void {
    this.registry.setNodeModelLabel(nodeId, label);
  }

  serializeMemory(): Record<string, NodeMemory> {
    return this.registry.serializeMemory();
  }

  restoreMemory(data: Record<string, unknown> | null | undefined): void {
    this.registry.restoreMemory(data);
  }

  /** Export running-config lengkap node (untuk fitur "Export Config" dari UI). */
  exportRunningConfig(vendorId: string, context: VendorContext): string {
    const nodeId = context.nodeId;
    const mem = this.getNodeMemory(nodeId);
    return generateRunningConfig(context, mem, vendorId);
  }

  dispatch(vendorId: string, rawInput: string, context: VendorContext): string {
    const adapter = this.getAdapter(vendorId);
    if (!adapter) return `% Error: Unknown vendor "${vendorId}". Supported: ${Array.from(this.adapters.keys()).join(', ')}`;

    const nodeId = context.nodeId;
    const mem = this.getNodeMemory(nodeId);

    // Baris kosong: perangkat sungguhan hanya mengulang prompt, tidak ada output.
    if (!rawInput || !rawInput.trim()) return '';

    // Dekorasi port dengan status link fisik dari topologi (context.portLinks:
    // portId|name → true / 'down' / false). Kabel dihapus → linkConnected=false
    // → CLI menampilkan "not connected" tetapi konfigurasi interface tetap utuh.
    // Tanpa portLinks (context manual/test) semua port dianggap terhubung.
    if (Array.isArray(context.ports)) {
      const links = portLinksOf(context);
      context.ports = context.ports.map((p: Record<string, unknown>) => {
        const pName = String(p.name || '');
        const pId = String(p.id || '');
        return {
          ...p,
          linkConnected: links ? (links[pName] ?? links[pId] ?? false) === true : true,
          linkDown: links ? (links[pName] ?? links[pId] ?? null) === 'down' : false,
        };
      });
    }

    const normalized: NormalizedCommand = adapter.parseSyntax(rawInput);

    // Execution environment — resolve command to result object.
    // undefined = tidak ada handler yang menangani → error "unknown command" di bawah.
    let cmdResult: CommandResult | undefined = runChain(vendorId, {
      rawInput,
      vendorId,
      context,
      mem,
      normalized,
      nodeId,
      payload: normalized.payload,
      registry: this.registry as MemoryRegistry,
    });

    if (cmdResult === undefined) {
      const unsupported = knownUnsupported(vendorId, rawInput);
      cmdResult = { raw: unsupported ?? unknownCommand(vendorId, rawInput) };
    }

    let response = adapter.formatResponse(cmdResult);

    // Real simulation hook: when a ping simulator is supplied by the host app,
    // replace the hardcoded echo-reply output with genuine simulated results.
    if (
      cmdResult?.type === 'ping' &&
      typeof context.pingSimulator === 'function'
    ) {
      response = context.pingSimulator(cmdResult.host || '', vendorId, cmdResult.size);
    }
    if (
      cmdResult?.type === 'traceroute' &&
      typeof context.tracerouteSimulator === 'function'
    ) {
      response = context.tracerouteSimulator(cmdResult.host || '', vendorId);
    }
    if (
      cmdResult?.type === 'http_get' &&
      typeof context.connectivitySimulator === 'function'
    ) {
      response = context.connectivitySimulator(cmdResult.host || '', vendorId, cmdResult.port || 80);
    }

    // No fake success: tanpa simulator engine, hasil jaringan tidak boleh
    // dikarang oleh formatter vendor (lihat CONTRACT vendor, aturan 12).
    if (cmdResult?.type === 'ping' && typeof context.pingSimulator !== 'function') {
      response = `ping to ${cmdResult.host || cmdResult.target || '?'}: simulation engine not available in this context. Use the NetLab ping panel.`;
    }
    if (cmdResult?.type === 'traceroute' && typeof context.tracerouteSimulator !== 'function') {
      response = `traceroute to ${cmdResult.host || '?'}: simulation engine not available in this context. Use the NetLab ping panel.`;
    }
    if (cmdResult?.type === 'http_get' && typeof context.connectivitySimulator !== 'function') {
      response = `GET http://${cmdResult.host || '?'}: connectivity simulation not available in this context.`;
    }

    return response;
  }
}

// Re-export untuk kompatibilitas dengan importer lama (index.ts tetap sumber API).
export type { _IV as IVendorAdapter };
export { CLIParser };