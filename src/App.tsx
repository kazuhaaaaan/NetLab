import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { LabProject, LabNode, LabEdge, Viewport, TerminalLog, VendorType, ActiveTool } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { TerminalPanel } from './components/TerminalPanel';
import { TutorialModal } from './components/TutorialModal';
import { MonorepoExplorerModal } from './components/MonorepoExplorerModal';
import { ContextMenu } from './components/ContextMenu';
import { MobileToolbar } from './components/MobileToolbar';
import { PingPanel, PingResult } from './components/PingPanel';
import { SplashScreen } from './components/SplashScreen';
import { LandingPage } from './components/LandingPage';
import { StorageEngine } from './storage/db';
import { VENDOR_MAP } from './data/vendors';
import { getDefaultModel, getModelsForVendor, getPortsForModel } from './data/deviceModels';
import { VendorDispatcher } from '../packages/vendors/src/index';
import { SimulationEngine, formatPingOutput } from './engine/sim';

const vendorDispatcher = new VendorDispatcher();

import { TEMPLATE_BASIC, TEMPLATE_ENTERPRISE } from './data/templates';

/** Infer the right cable type from port & device types (auto-detection). */
function inferCableType(
  srcDeviceType: string,
  tgtDeviceType: string,
  portType: string
): LabEdge['cableType'] {
  if (portType === 'fiber') return 'fiber';
  if (portType === 'serial') return 'serial';
  // copper: same device class → crossover, host ↔ network device → straight
  const srcHost = srcDeviceType === 'pc' || srcDeviceType === 'server';
  const tgtHost = tgtDeviceType === 'pc' || tgtDeviceType === 'server';
  if (srcHost !== tgtHost) return 'copper_straight';
  if (srcDeviceType === tgtDeviceType) return 'copper_cross';
  return 'copper_straight';
}

const CABLE_TYPE_LABEL: Record<LabEdge['cableType'], string> = {
  copper_straight: 'Copper Straight',
  copper_cross: 'Copper Crossover',
  fiber: 'Fiber Optic',
  serial: 'Serial',
};


export default function App() {
  // Show splash only once per browser session
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (sessionStorage.getItem('mklab_splash_shown')) return false;
    return true;
  });

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem('mklab_splash_shown', '1');
    setShowSplash(false);
  }, []);

  // Landing page vs Canvas simulator view — persist agar reload tidak kembali ke homepage
  const [view, setView] = useState<'landing' | 'canvas'>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('netlab_view') === 'canvas'
      ? 'canvas'
      : 'landing'
  );

  const goToCanvas = useCallback(() => {
    localStorage.setItem('netlab_view', 'canvas');
    setView('canvas');
  }, []);

  const goToHome = useCallback(() => {
    localStorage.setItem('netlab_view', 'landing');
    setView('landing');
  }, []);

  const [project, setProject] = useState<LabProject>(TEMPLATE_BASIC);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [cableStart, setCableStart] = useState<{ nodeId: string; portId: string } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [viewPorts, setViewPorts] = useState(false);

  // Real network simulation engine (per-device routing, TTL, hop trace)
  const simEngineRef = useRef<SimulationEngine>(new SimulationEngine());

  // Transient feedback toast (cable connect, errors, ...)
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'error' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ msg, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Terminal State — dipersist supaya log/konfigurasi CLI tetap terlihat setelah reload
  const TERMINAL_STATE_KEY = 'netlab_terminal_state_v1';

  const loadTerminalState = () => {
    try {
      const raw = localStorage.getItem(TERMINAL_STATE_KEY);
      if (!raw) return { logs: {} as Record<string, TerminalLog[]>, open: [] as string[], active: null as string | null, isOpen: false as boolean };
      const parsed = JSON.parse(raw);
      return {
        logs: (parsed.logs ?? {}) as Record<string, TerminalLog[]>,
        open: Array.isArray(parsed.open) ? (parsed.open as string[]) : [],
        active: typeof parsed.active === 'string' ? (parsed.active as string) : null,
        isOpen: Boolean(parsed.isOpen),
      };
    } catch {
      return { logs: {} as Record<string, TerminalLog[]>, open: [] as string[], active: null as string | null, isOpen: false as boolean };
    }
  };

  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(() => loadTerminalState().isOpen);
  const [openTerminalNodeIds, setOpenTerminalNodeIds] = useState<string[]>(() => {
    const open = loadTerminalState().open;
    return open.length > 0 ? open : ['node-1'];
  });
  const [activeTerminalNodeId, setActiveTerminalNodeId] = useState<string>(
    () => loadTerminalState().active || 'node-1'
  );
  const [terminalLogs, setTerminalLogs] = useState<Record<string, TerminalLog[]>>(() => {
    const st = loadTerminalState();
    if (Object.keys(st.logs).length > 0) return st.logs;
    return {
      'node-1': [
        { id: '1', nodeId: 'node-1', text: '  MikroTik RouterOS 7.12 (c) 1999-2026', type: 'system', timestamp: new Date().toLocaleTimeString() },
        { id: '2', nodeId: 'node-1', text: 'Type /help or /ip address print to inspect interface configuration.', type: 'system', timestamp: new Date().toLocaleTimeString() }
      ]
    };
  });

  // Auto-save terminal state (log CLI + tab yang terbuka) agar reload tetap terlihat
  useEffect(() => {
    try {
      const capped: Record<string, TerminalLog[]> = {};
      for (const [k, v] of Object.entries(terminalLogs) as [string, TerminalLog[]][]) capped[k] = v.slice(-300);
      localStorage.setItem(
        TERMINAL_STATE_KEY,
        JSON.stringify({ logs: capped, open: openTerminalNodeIds, active: activeTerminalNodeId, isOpen: isTerminalOpen })
      );
    } catch {
      // storage penuh / tidak tersedia — abaikan
    }
  }, [terminalLogs, openTerminalNodeIds, activeTerminalNodeId, isTerminalOpen]);

  // UI Modals & Panels
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const [isMonorepoOpen, setIsMonorepoOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId?: string; targetType?: string } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Ping PDU simulation state
  const [pingResults, setPingResults] = useState<PingResult[]>([]);
  const [pingSource, setPingSource] = useState<string | null>(null); // first-click node
  const [isPingPanelOpen, setIsPingPanelOpen] = useState(true);

  // Undo / Redo history
  const historyRef = useRef<LabProject[]>([TEMPLATE_BASIC]);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Check tutorial on first visit (only for touch devices)
  useEffect(() => {
    if ('ontouchstart' in window && !StorageEngine.hasSeenTutorial()) {
      setIsTutorialOpen(true);
    }

    // Load saved project from IndexedDB if present
    StorageEngine.loadProject().then((saved) => {
      if (saved) setProject(saved);
    });

    // Restore CLI-configured device state (IPs/routes/BGP) from storage
    StorageEngine.loadDeviceConfigs().then((configs) => {
      vendorDispatcher.restoreMemory(configs);
      const mem = vendorDispatcher.serializeMemory();
      for (const nodeId of Object.keys(mem)) {
        simEngineRef.current.applyNodeConfig(nodeId, mem[nodeId].configuredIps, mem[nodeId].routes);
      }
    });
  }, []);

  // Auto-save project changes
  useEffect(() => {
    StorageEngine.saveProject(project);
  }, [project]);

  // Keep the simulation engine in sync with the topology
  useEffect(() => {
    simEngineRef.current.syncTopology(project);
  }, [project]);

  // setProject wrapper that pushes to undo history
  const setProjectWithHistory = useCallback((updater: ((prev: LabProject) => LabProject) | LabProject) => {
    setProject((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (isUndoRedoRef.current) return next;
      // Truncate any redo-future then push
      const sliced = historyRef.current.slice(0, historyIndexRef.current + 1);
      sliced.push(next);
      if (sliced.length > 50) sliced.shift();
      historyRef.current = sliced;
      historyIndexRef.current = sliced.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isUndoRedoRef.current = true;
    setProject(historyRef.current[historyIndexRef.current]);
    isUndoRedoRef.current = false;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isUndoRedoRef.current = true;
    setProject(historyRef.current[historyIndexRef.current]);
    isUndoRedoRef.current = false;
    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Keyboard shortcut: Delete / Backspace to remove selected edge or node
  //                     Ctrl+Z = Undo, Ctrl+Y / Ctrl+Shift+Z = Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      // Don't trigger if typing in an input / textarea
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      // Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          setProjectWithHistory((prev) => ({
            ...prev,
            edges: prev.edges.filter((edge) => edge.id !== selectedEdgeId)
          }));
          setSelectedEdgeId(null);
        } else if (selectedNodeId) {
          setProjectWithHistory((prev) => ({
            ...prev,
            nodes: prev.nodes.filter((n) => n.id !== selectedNodeId),
            edges: prev.edges.filter((e) => e.sourceNodeId !== selectedNodeId && e.targetNodeId !== selectedNodeId)
          }));
          setSelectedNodeId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, selectedNodeId, handleUndo, handleRedo, setProjectWithHistory]);

  const handleAddNode = (
    vendor: VendorType,
    deviceType: 'router' | 'switch' | 'firewall' | 'pc' | 'server' | 'wireless',
    model?: string
  ) => {
    const id = `node-${Date.now()}`;
    // Server devices always use Debian Linux CLI
    const effectiveVendor: VendorType = deviceType === 'server' ? 'linux' : vendor;
    const vendorInfo = VENDOR_MAP[effectiveVendor];
    const defaultModel = getDefaultModel(effectiveVendor, deviceType);
    const chosenModel =
      model && getModelsForVendor(effectiveVendor).some((m) => m.label === model)
        ? model
        : defaultModel;

    // Port layout mengikuti model perangkat yang dipilih (mis. CRS326 → ether1-ether24 + sfp1-2)
    const basePorts = getPortsForModel(effectiveVendor, chosenModel);

    const getPortsForDeviceType = () => {
      if (deviceType === 'wireless') {
        return [
          ...basePorts.slice(0, 2),
          { id: 'wlan1', name: vendor === 'mikrotik' ? 'wlan1' : 'Wlan0', speedMbps: 300, status: 'up' as const, macAddress: '52:54:00:AA:BB:02', type: 'copper' as const },
          { id: 'wlan2', name: vendor === 'mikrotik' ? 'wlan2' : 'Wlan1', speedMbps: 300, status: 'down' as const, macAddress: '52:54:00:AA:BB:03', type: 'copper' as const },
        ];
      }
      if (deviceType === 'pc') {
        return basePorts.slice(0, 1);
      }
      return basePorts;
    };

    const newNode: LabNode = {
      id,
      name: deviceType === 'server' ? `debian-server` : `${vendorInfo.name.split(' ')[0]}-${deviceType.toUpperCase()}`,
      vendor: effectiveVendor,
      model: chosenModel,
      deviceType,
      position: { x: Math.abs(project.viewport.x) + 200, y: Math.abs(project.viewport.y) + 200 },
      ports: getPortsForDeviceType(),
    };

    vendorDispatcher.setNodeModelLabel(id, chosenModel);

    setProjectWithHistory((prev) => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
    setSelectedNodeId(id);
  };

  const handleDeleteNode = (nodeId: string) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId)
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setOpenTerminalNodeIds((prev) => prev.filter((id) => id !== nodeId));
    setActiveTerminalNodeId((cur) =>
      cur === nodeId ? (openTerminalNodeIds.find((i) => i !== nodeId) ?? '') : cur
    );
    vendorDispatcher.forgetNodeMemory(nodeId);
    const remaining = vendorDispatcher.serializeMemory();
    StorageEngine.saveDeviceConfigs(remaining);
  };

  const handleDeleteEdge = (edgeId: string) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId)
    }));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  };

  const handleUpdateNodeName = (nodeId: string, name: string) => {
    setProjectWithHistory((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, name } : n))
    }));
  };

  const handleUpdateNodeModel = (nodeId: string, model: string) => {
    setProjectWithHistory((prev) => {
      // Layout port mengikuti model baru; IP di port yang namanya sama dipertahankan
      const updatedNodes = prev.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        let newPorts = getPortsForModel(n.vendor, model).map((np) => {
          const old = n.ports.find((op) => op.name === np.name || op.id === np.name);
          return old && old.ipAddress ? { ...np, ipAddress: old.ipAddress } : np;
        });
        // node wireless tetap punya port wlan
        if (n.deviceType === 'wireless') {
          const wlan = (base: string) =>
            ({ id: base, name: base, speedMbps: 300, status: 'down' as const, macAddress: '52:54:00:AA:BB:02', type: 'copper' as const });
          newPorts = [...newPorts.slice(0, 2), wlan(n.vendor === 'mikrotik' ? 'wlan1' : 'Wlan0'), wlan(n.vendor === 'mikrotik' ? 'wlan2' : 'Wlan1')];
        }
        return { ...n, model, ports: newPorts };
      });
      const changed = updatedNodes.find((x) => x.id === nodeId);
      const keepIds = new Set(changed?.ports.map((p) => p.id) ?? []);
      return {
        ...prev,
        nodes: updatedNodes,
        // kabel ke port yang tidak ada lagi di model baru ikut dibuang
        edges: prev.edges.filter((e) => {
          if (e.sourceNodeId === nodeId && !keepIds.has(e.sourcePortId)) return false;
          if (e.targetNodeId === nodeId && !keepIds.has(e.targetPortId)) return false;
          return true;
        }),
      };
    });
    vendorDispatcher.setNodeModelLabel(nodeId, model);
  };

  /**
   * Connect two ports (tap-tap flow from the port popover or direct drag).
   * Validates types & occupancy, auto-detects the cable type and creates
   * the edge immediately — no extra modal needed.
   */
  const handleCableConnect = useCallback(
    (
      source: { nodeId: string; portId: string },
      target: { nodeId: string; portId?: string }
    ) => {
      const srcNode = project.nodes.find((n) => n.id === source.nodeId);
      if (!srcNode) return;

      // Allow dropping onto a node body: auto-pick the first free port
      let tgtNode = project.nodes.find((n) => n.id === target.nodeId);
      if (!tgtNode || tgtNode.id === srcNode.id) {
        showToast('Tidak bisa menyambung port ke device yang sama', 'error');
        return;
      }

      let tgtPort = tgtNode.ports.find((p) => p.id === target.portId);
      if (!tgtPort) {
        const srcPort = srcNode.ports.find((p) => p.id === source.portId);
        tgtPort = tgtNode.ports.find(
          (p) => p.type === srcPort?.type && !isPortBusy(tgtNode.id, p.id)
        );
        if (tgtPort) {
          showToast(`Port otomatis dipilih: ${tgtNode.name}:${tgtPort.name}`);
        }
      }

      const srcPort = srcNode.ports.find((p) => p.id === source.portId);
      if (!srcPort || !tgtPort) {
        showToast('Port tidak ditemukan atau tidak ada port yang cocok', 'error');
        return;
      }

      if (isPortBusy(srcNode.id, srcPort.id)) {
        showToast(`Port ${srcNode.name}:${srcPort.name} sudah terpakai`, 'error');
        return;
      }
      if (isPortBusy(tgtNode.id, tgtPort.id)) {
        showToast(`Port ${tgtNode.name}:${tgtPort.name} sudah terpakai`, 'error');
        return;
      }

      if (srcPort.type !== tgtPort.type) {
        showToast(
          `Tipe port tidak cocok: ${srcPort.name} (${srcPort.type}) vs ${tgtPort.name} (${tgtPort.type})`,
          'error'
        );
        return;
      }

      const cableType = inferCableType(srcNode.deviceType, tgtNode.deviceType, srcPort.type);
      const newEdge: LabEdge = {
        id: `edge-${Date.now()}`,
        sourceNodeId: srcNode.id,
        sourcePortId: srcPort.id,
        targetNodeId: tgtNode.id,
        targetPortId: tgtPort.id,
        cableType,
      };
      setProjectWithHistory((prev) => ({
        ...prev,
        edges: [...prev.edges, newEdge],
      }));
      showToast(
        `${CABLE_TYPE_LABEL[cableType]} terhubung: ${srcNode.name}:${srcPort.name} ↔ ${tgtNode.name}:${tgtPort.name}`
      );
    },
    [project, setProjectWithHistory, showToast]
  );

  /** True when a port is already used by an edge. */
  const isPortBusy = (nodeId: string, portId: string): boolean => {
    return project.edges.some(
      (e) =>
        (e.sourceNodeId === nodeId && e.sourcePortId === portId) ||
        (e.targetNodeId === nodeId && e.targetPortId === portId)
    );
  };

  const handlePortClick = (nodeId: string, portId: string) => {
    if (!cableStart) {
      setCableStart({ nodeId, portId });
      return;
    }
    if (cableStart.nodeId !== nodeId) {
      handleCableConnect(
        { nodeId: cableStart.nodeId, portId: cableStart.portId },
        { nodeId, portId }
      );
    } else {
      showToast('Tidak bisa menyambung port ke device yang sama', 'error');
    }
    setCableStart(null);
  };

  /**
   * Handle ping tool node click.
   * First click = source node. Second click = destination node.
   * Adds a pending result; the real ICMP simulation runs on "Run Test".
   */
  const handleNodeClickForPing = (nodeId: string) => {
    if (!pingSource) {
      setPingSource(nodeId);
      return;
    }
    // Second click — run ping
    const srcNode = project.nodes.find((n) => n.id === pingSource);
    const dstNode = project.nodes.find((n) => n.id === nodeId);
    if (!srcNode || !dstNode) { setPingSource(null); return; }

    // Get any IP from destination node
    const dstIp = dstNode.ports.find((p) => p.ipAddress)?.ipAddress?.split('/')[0] || dstNode.name;

    const pendingId = `ping-${Date.now()}`;
    const pendingResult: PingResult = {
      id: pendingId,
      srcNodeId: srcNode.id,
      srcNodeName: srcNode.name,
      dstNodeId: dstNode.id,
      dstNodeName: dstNode.name,
      dstIp,
      status: 'pending',
      message: 'Ready to run...',
      timestamp: new Date().toLocaleTimeString(),
    };
    setPingResults((prev) => [...prev, pendingResult]);
    setPingSource(null);
  };

  const handleRunPing = (pingId: string) => {
    const ping = pingResults.find((p) => p.id === pingId);
    if (!ping) return;

    setPingResults((prev) =>
      prev.map((r) =>
        r.id === pingId ? { ...r, status: 'running', message: 'Sending ICMP echo request…' } : r
      )
    );

    setTimeout(() => {
      const simResult = simEngineRef.current.simulatePing(ping.srcNodeId, ping.dstIp);
      const path = simResult.path.length > 0 ? ` (${simResult.path.join(' → ')})` : '';
      let status: PingResult['status'];
      let message: string;

      if (simResult.success) {
        status = 'success';
        message = `Reply from ${ping.dstIp}: bytes=32 time=<1ms TTL=${simResult.ttlAtDestination || 64}${path}`;
      } else {
        status = 'failed';
        const reasons: Record<string, string> = {
          'no-ip': 'Sumber belum punya IP (atur lewat CLI, contoh: /ip address add …)',
          invalid: `Alamat tujuan tidak valid: ${ping.dstIp}`,
          'not-found': 'Node sumber tidak ditemukan',
          ttl: 'Time to live exceeded (loop rute / hop terlalu banyak)',
          unreachable: `Request timeout — host unreachable atau tidak ada rute ke ${ping.dstIp}`,
          self: 'Tujuan adalah device ini sendiri',
        };
        message = reasons[simResult.reason || 'unreachable'];
      }

      setPingResults((prev) =>
        prev.map((r) => (r.id === pingId ? { ...r, status, message } : r))
      );
    }, 600);
  };

  // Cancel ping source selection on tool change
  useEffect(() => {
    if (activeTool !== 'ping') setPingSource(null);
  }, [activeTool]);

  const handleOpenTerminal = (nodeId: string) => {
    if (!openTerminalNodeIds.includes(nodeId)) {
      setOpenTerminalNodeIds((prev) => [...prev, nodeId]);
      if (!terminalLogs[nodeId]) {
        const node = project.nodes.find((n) => n.id === nodeId);
        setTerminalLogs((prev) => ({
          ...prev,
          [nodeId]: [
            {
              id: String(Date.now()),
              nodeId,
              text: `Terminal connected to ${node?.name} [Vendor: ${node?.vendor}]`,
              type: 'system',
              timestamp: new Date().toLocaleTimeString()
            }
          ]
        }));
      }
    }
    setActiveTerminalNodeId(nodeId);
    setIsTerminalOpen(true);
  };

  const handleSendTerminalCommand = (nodeId: string, cmd: string) => {
    const node = project.nodes.find((n) => n.id === nodeId);
    const vendor = node?.vendor || 'mikrotik';

    const inputLog: TerminalLog = {
      id: String(Date.now()),
      nodeId,
      text: cmd,
      type: 'input',
      timestamp: new Date().toLocaleTimeString()
    };

    let responseText = '';

    if (node) {
      // Sync CLI-configured IPs/routes into the simulation engine, then run.
      const mem = vendorDispatcher.getNodeMemory(nodeId);
      simEngineRef.current.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);

      responseText = vendorDispatcher.dispatch(vendor, cmd, {
        nodeId,
        name: node.name,
        ports: node.ports,
        pingSimulator: (host: string, vendorId: string) => {
          const result = simEngineRef.current.simulatePing(nodeId, host);
          return formatPingOutput(vendorId, host, result);
        },
      });

      // Pick up config changes made by this command (add_ip / add_route)
      simEngineRef.current.applyNodeConfig(nodeId, mem.configuredIps, mem.routes);

      // Persist CLI state so a refresh keeps the configured topology
      StorageEngine.saveDeviceConfigs(vendorDispatcher.serializeMemory());
    } else {
      responseText = `Error: Node not found.`;
    }

    const outputLog: TerminalLog = {
      id: String(Date.now() + 1),
      nodeId,
      text: responseText,
      type: 'output',
      timestamp: new Date().toLocaleTimeString()
    };

    setTerminalLogs((prev) => ({
      ...prev,
      [nodeId]: [...(prev[nodeId] || []), inputLog, outputLog]
    }));
  };

  const selectedNode = project.nodes.find((n) => n.id === selectedNodeId) || null;

  // ── Landing page (pre-canvas) ──────────────────────────────────────────
  if (view === 'landing') {
    return (
      <>
        <LandingPage onLaunch={goToCanvas} onOpenDonate={() => setIsDonateOpen(true)} />
        {showSplash && <SplashScreen onDone={handleSplashDone} />}

        {/* Donate Modal (QRIS) — tampil juga di homepage */}
        {isDonateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in duration-200">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span className="text-rose-500 text-xl">♥</span> Donate untuk Support Developer
                </h2>
                <button onClick={() => setIsDonateOpen(false)} className="text-slate-400 hover:text-slate-200 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 flex flex-col items-center">
                <img src="/qris.jpeg" alt="QRIS Donation" className="w-56 h-auto object-contain rounded-lg border-2 border-slate-700 mb-4 shadow-md" />
                <p className="text-sm text-slate-300 text-center font-medium">
                  Terima kasih atas dukungannya! Donasi kamu membantu developer NetLab terus mengembangkan simulator ini.
                </p>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={`w-screen h-screen flex flex-col overflow-hidden font-sans ${theme === 'dark' ? 'bg-[#0B0C0E] text-slate-100' : 'bg-[#f4f5f8] text-slate-900'}`}>
      {/* Navigation Header */}
      <Navbar
        project={project}
        onGoHome={goToHome}
        onNewProject={() => {
          if (confirm('Create new empty lab topology?')) {
            setProject({
              ...TEMPLATE_BASIC,
              nodes: [],
              edges: []
            });
            vendorDispatcher.restoreMemory(null);
            StorageEngine.clearDeviceConfigs();
          }
        }}
        onExportMlab={() => StorageEngine.exportProjectAsFile(project)}
        onImportMlab={async (file) => {
          try {
            const imported = await StorageEngine.parseProjectFile(file);
            setProject(imported);
          } catch (err: any) {
            alert(`Failed to import .mlab file: ${err.message}`);
          }
        }}
        onOpenMonorepo={() => setIsMonorepoOpen(true)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onLoadTemplate={(tpl) => {
          if (tpl === 'basic') setProjectWithHistory(TEMPLATE_BASIC);
          if (tpl === 'enterprise') setProjectWithHistory(TEMPLATE_ENTERPRISE);
        }}
        onOpenDonate={() => setIsDonateOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          selectedNode={selectedNode}
          onAddNode={handleAddNode}
          onUpdateNodeName={handleUpdateNodeName}
          onUpdateNodeModel={handleUpdateNodeModel}
          onDeleteNode={handleDeleteNode}
          onOpenTerminal={handleOpenTerminal}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Central Canvas Engine */}
        <main className={`flex-1 relative transition-all duration-300 ${isSidebarOpen ? 'ml-80' : 'ml-0'} ${isTerminalOpen ? 'mb-80 md:mb-96' : 'mb-0'}`}>
          <Canvas
            nodes={project.nodes}
            edges={project.edges}
            viewport={project.viewport}
            onViewportChange={(viewport) => setProject((prev) => ({ ...prev, viewport }))}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => {
              if (activeTool === 'ping') {
                handleNodeClickForPing(id);
                return;
              }
              setSelectedNodeId(id);
              setContextMenu(null);
              // CLI follows the selected device: switch the terminal tab to it
              if (id && isTerminalOpen) {
                if (!openTerminalNodeIds.includes(id)) {
                  setOpenTerminalNodeIds((prev) => [...prev, id]);
                }
                setActiveTerminalNodeId(id);
              }
            }}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              setContextMenu(null);
            }}
            onDeleteEdge={handleDeleteEdge}
            onNodePositionChange={(id, pos) => {
              setProject((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === id ? { ...n, position: pos } : n))
              }));
            }}
            onOpenTerminal={handleOpenTerminal}
            onPortClick={handlePortClick}
            onCableConnect={handleCableConnect}
            cableStart={cableStart}
            activeTool={activeTool}
            onContextMenu={(e, targetType, targetId) => {
              setContextMenu({ x: e.clientX, y: e.clientY, targetId, targetType });
            }}
            selectionBox={null}
            theme={theme}
            viewPorts={viewPorts}
            onToggleViewPorts={() => setViewPorts((v) => !v)}
          />

          {/* Context Menu Popup */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              targetId={contextMenu.targetId}
              targetType={contextMenu.targetType}
              onOpenTerminal={handleOpenTerminal}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onClose={() => setContextMenu(null)}
            />
          )}

          {/* Floating Mobile / Gesture Bottom Toolbar */}
          <MobileToolbar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            onZoomIn={() => setProject((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.min(prev.viewport.zoom + 0.15, 3.0) } }))}
            onZoomOut={() => setProject((prev) => ({ ...prev, viewport: { ...prev.viewport, zoom: Math.max(prev.viewport.zoom - 0.15, 0.25) } }))}
            onResetView={() => setProject((prev) => ({ ...prev, viewport: { x: 0, y: 0, zoom: 1.0 } }))}
            onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
            onQuickAddRouter={() => handleAddNode('mikrotik', 'router')}
          />
        </main>
      </div>

      {/* Vendor Terminal Viewport Panel */}
      <TerminalPanel
        openNodes={project.nodes.filter((n) => openTerminalNodeIds.includes(n.id))}
        activeNodeId={activeTerminalNodeId}
        onSelectTab={setActiveTerminalNodeId}
        onCloseTab={(id) => {
          setOpenTerminalNodeIds((prev) => prev.filter((i) => i !== id));
          if (openTerminalNodeIds.length <= 1) setIsTerminalOpen(false);
        }}
        logs={terminalLogs}
        onSendCommand={handleSendTerminalCommand}
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
      />

      {/* PDU / Ping Simulation Panel */}
      {!isTerminalOpen && (
        <PingPanel
          nodes={project.nodes}
          edges={project.edges}
          pingResults={pingResults}
          onClear={() => setPingResults([])}
          isOpen={isPingPanelOpen}
          onToggle={() => setIsPingPanelOpen(!isPingPanelOpen)}
          onRunPing={handleRunPing}
        />
      )}

      {/* Donate Modal */}
      {isDonateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span className="text-rose-500 text-xl">♥</span> Donate untuk Support Developer
              </h2>
              <button onClick={() => setIsDonateOpen(false)} className="text-slate-400 hover:text-slate-200 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center">
              <img src="/qris.jpeg" alt="QRIS Donation" className="w-56 h-auto object-contain rounded-lg border-2 border-slate-700 mb-4 shadow-md" />
              <p className="text-sm text-slate-300 text-center font-medium">
                Terima kasih atas dukungannya! Donasi kamu membantu developer NetLab terus mengembangkan simulator ini.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* First-Time Experience Tutorial Modal */}
      <TutorialModal isOpen={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />

      {/* Monorepo Package Explorer Modal */}
      <MonorepoExplorerModal isOpen={isMonorepoOpen} onClose={() => setIsMonorepoOpen(false)} />

      {/* Connection / Feedback Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-2xl backdrop-blur-md text-xs font-medium ${
              toast.kind === 'ok'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toast.kind === 'ok' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
