import React, { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Router,
  Server,
  Laptop,
  ShieldAlert,
  HardDrive,
  Plus,
  X,
  Wifi,
  Trash2,
  TerminalSquare,
  Eye,
  EyeOff,
  Lock,
  Unlock,
} from "lucide-react";
import { cableMatchesPort, inferCableType, portSide, portSlot } from "../connection";

const LockFilled = () => <Lock className="w-4 h-4" />;
const LockOpen = () => <Unlock className="w-4 h-4" />;

export interface Point {
  x: number;
  y: number;
}

export interface Port {
  id: string;
  name: string;
  type?: string;
  status: "up" | "down";
  ipAddress?: string;
  /** Metadata geometri port (opsional) — posisi visual menjadi stabil meski
   *  urutan array port berubah (audit arsitektur: anchor tidak lagi index-only). */
  side?: "left" | "right";
  slot?: number;
}

export interface LabNode {
  id: string;
  name: string;
  deviceType: "router" | "switch" | "firewall" | "pc" | "server" | "wireless";
  vendor: string;
  model: string;
  position: Point;
  selected?: boolean;
  ports: Port[];
  powered?: boolean;
}

export interface LabEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: "copper_straight" | "copper_cross" | "fiber" | "serial";
  /** latensi kabel (ms) — override nilai default sesuai tipe kabel */
  latencyMs?: number;
  /** bandwidth link (Mbps) */
  bandwidthMbps?: number;
  /** true = link sengaja dimatikan (failure injection) */
  down?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type ActiveTool = "select" | "pan" | "cable" | "delete";

// Fixed node geometry - used for port anchors & cable rendering
export const NODE_W = 96;
export const NODE_H = 88;
const PORT_TOP = 20;
const PORT_GAP = 18;

/** World-space anchor of a node's port (left/right edge). Falls back to center. */
function getPortAnchor(node: LabNode, portId: string): { x: number; y: number } {
  const idx = node.ports.findIndex((p) => p.id === portId);
  if (idx < 0) {
    return {
      x: node.position.x + NODE_W / 2,
      y: node.position.y + NODE_H / 2,
    };
  }
  const port = node.ports[idx];
  const side = portSide(port, idx);
  const slot = portSlot(port, idx);
  return {
    x: node.position.x + (side === "left" ? 0 : NODE_W),
    y: node.position.y + PORT_TOP + slot * PORT_GAP,
  };
}

/** Cable endpoint on a node: clamped inside the device body so cables
 *  visually plug INTO the device instead of floating at the port dot
 *  (ports on the lower slots stick out below the node otherwise). */
function getEdgeAnchor(node: LabNode, portId: string): { x: number; y: number } {
  const a = getPortAnchor(node, portId);
  const inset = 6;
  return {
    x: Math.min(Math.max(a.x, node.position.x + inset), node.position.x + NODE_W - inset),
    y: Math.min(Math.max(a.y, node.position.y + inset), node.position.y + NODE_H - inset),
  };
}

import { GestureType, GestureDetail, InteractionEngine } from "../engine/InteractionEngine";
import { PacketAnimation } from "../types";

/** Konversi kotak seleksi (koordinat layar engine) → koordinat dunia. */
function selectionRectToWorld(
  rect: { x1: number; y1: number; x2: number; y2: number },
  viewport: Viewport
): { x1: number; y1: number; x2: number; y2: number } {
  return {
    x1: (rect.x1 - viewport.x) / viewport.zoom,
    y1: (rect.y1 - viewport.y) / viewport.zoom,
    x2: (rect.x2 - viewport.x) / viewport.zoom,
    y2: (rect.y2 - viewport.y) / viewport.zoom,
  };
}

/** Perangkat yang bounding box-nya menyentuh kotak seleksi. */
function nodesInSelectionRect(
  rect: { x1: number; y1: number; x2: number; y2: number },
  nodes: LabNode[],
  viewport: Viewport
): string[] {
  const w = selectionRectToWorld(rect, viewport);
  const minX = Math.min(w.x1, w.x2);
  const minY = Math.min(w.y1, w.y2);
  const maxX = Math.max(w.x1, w.x2);
  const maxY = Math.max(w.y1, w.y2);
  return nodes
    .filter((n) => {
      const left = n.position.x;
      const top = n.position.y;
      const right = n.position.x + NODE_W;
      const bottom = n.position.y + NODE_H;
      return left < maxX && right > minX && top < maxY && bottom > minY;
    })
    .map((n) => n.id);
}

interface CanvasProps {
  nodes: LabNode[];
  edges: LabEdge[];
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onNodePositionChange: (nodeId: string, pos: { x: number; y: number }) => void;
  /** Mobile: TAP biasa pada perangkat (tanpa drag) — buka sheet aksi perangkat. */
  onNodeTap?: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
  onPortClick: (nodeId: string, portId: string) => void;
  onCableConnect: (
    source: { nodeId: string; portId: string },
    target: { nodeId: string; portId?: string },
    cableType?: string
  ) => void;
  cableStart: { nodeId: string; portId: string } | null;
  activeTool: ActiveTool;
  onContextMenu: (
    e: React.MouseEvent,
    targetType?: string,
    targetId?: string,
  ) => void;
  selectionBox: { x1: number; y1: number; x2: number; y2: number } | null;
  theme: "dark" | "light";
  selectedEdgeId: string | null;
  onSelectEdge: (edgeId: string | null) => void;
  onDeleteEdge?: (edgeId: string) => void;
  /** Hapus semua kabel yang terhubung ke sebuah node (dipakai tombol hapus kabel di overlay node). */
  onDeleteNodeCables?: (nodeId: string) => void;
  viewPorts?: boolean;
  onToggleViewPorts?: () => void;
  /** Animasi paket ping yang melintasi kabel (dari hasil simulasi). */
  packetAnimations?: PacketAnimation[];
  /** Id perangkat yang terpilih sekaligus (multi-select). */
  selectedNodeIds?: string[];
  /** Commit hasil selection box / multi-select. */
  onSelectNodes?: (nodeIds: string[]) => void;
  /** Toggle satu perangkat ke/keluar dari multi-select (Shift+klik). */
  onToggleNodeSelected?: (nodeId: string) => void;
  /** Perbarui properti sebuah kabel (latensi/bandwidth/down). */
  onUpdateEdge?: (edgeId: string, partial: Partial<LabEdge>) => void;
  /** Nama interface yang dikonfigurasi sebagai trunk (untuk warna kabel). */
  trunkPortsByNode?: Record<string, string[]>;
  /** true = kanvas terkunci (gesture pan/zoom/drag nonaktif; tombol tetap jalan). */
  locked?: boolean;
  onToggleLock?: () => void;
  /** true = viewport mobile (menampilkan floating action bar + tidak menampilkan tombol desktop). */
  isMobile?: boolean;
  /** Id perangkat yang sedang diuji ping (badge kuning). */
  pingingNodeIds?: string[];
  /** Id perangkat tujuan ping yang gagal (badge merah menyala). */
  failedPingNodeIds?: string[];
}

/** Popover interaktif di atas canvas — blokir gesture engine (preventDefault + TAP) agar klik asli & dropdown tetap berfungsi. */
const WizardPopover: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: PointerEvent) => e.stopPropagation();
    el.addEventListener("pointerdown", stop);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    return () => {
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
    };
  }, []);
  return (
    <div ref={ref} className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
};

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  edges,
  viewport,
  onViewportChange,
  selectedNodeId,
  onSelectNode,
  onNodePositionChange,
  onOpenTerminal,
  onPortClick,
  onCableConnect,
  cableStart,
  activeTool,
  onContextMenu,
  selectionBox,
  theme,
  selectedEdgeId,
  onSelectEdge,
  onDeleteEdge,
  onDeleteNodeCables,
  viewPorts = false,
  onToggleViewPorts,
  packetAnimations = [],
  selectedNodeIds = [],
  onSelectNodes,
  onToggleNodeSelected,
  onUpdateEdge,
  onNodeTap,
  trunkPortsByNode = {},
  locked = false,
  onToggleLock,
  isMobile = false,
  pingingNodeIds = [],
  failedPingNodeIds = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleGestureRef = useRef<(gesture: GestureDetail) => void>(() => {});
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [cableWizard, setCableWizard] = useState<{
    sourceNodeId: string;
    sourcePortId: string | null;
    cableType: string | null;
    targetNodeId: string | null;
  } | null>(null);
  /** Draft kabel dari drag-and-drop: kabel BELUM disambung sampai tipe dikonfirmasi. */
  const [cableDraft, setCableDraft] = useState<{
    srcNodeId: string;
    srcPortId: string;
    tgtNodeId: string;
    tgtPortId: string;
    inferred: LabEdge['cableType'];
    selected: LabEdge['cableType'];
  } | null>(null);
  const [pointerWorld, setPointerWorld] = useState<{ x: number; y: number } | null>(null);
  const [cableDrag, setCableDrag] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [cableHover, setCableHover] = useState<{
    nodeId: string;
    portId: string;
  } | null>(null);

  // ── Animasi paket ping melintasi kabel ──
  const PACKET_DURATION = 1200;
  const [packetRuns, setPacketRuns] = useState<
    (PacketAnimation & { startedAt: number })[]
  >([]);
  const [packetPositions, setPacketPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  useEffect(() => {
    if (!packetAnimations || packetAnimations.length === 0) return;
    const now = Date.now();
    const fresh = packetAnimations.filter(
      (a) => !packetRuns.some((r) => r.id === a.id)
    );
    if (fresh.length > 0) {
      setPacketRuns((prev) => [
        ...prev,
        ...fresh.map((a) => ({ ...a, startedAt: now })),
      ]);
    }
  }, [packetAnimations]);

  useEffect(() => {
    if (packetRuns.length === 0) {
      setPacketPositions({});
      return;
    }
    let raf = 0;
    const tick = () => {
      const now = Date.now();
      const positions: Record<string, { x: number; y: number }> = {};
      let alive = 0;
      for (const run of packetRuns) {
        const duration = run.durationMs ?? PACKET_DURATION;
        const elapsed = now - run.startedAt;
        if (elapsed >= duration) continue;
        alive++;
        const edgeIds = run.reverse ? [...run.edgeIds].reverse() : run.edgeIds;
        const pts: { x: number; y: number }[] = [];
        for (const eid of edgeIds) {
          const edge = edges.find((e) => e.id === eid);
          if (!edge) continue;
          const sNode = nodes.find((n) => n.id === edge.sourceNodeId);
          const tNode = nodes.find((n) => n.id === edge.targetNodeId);
          if (!sNode || !tNode) continue;
          const { x: x1, y: y1 } = getEdgeAnchor(sNode, edge.sourcePortId);
          const { x: x2, y: y2 } = getEdgeAnchor(tNode, edge.targetPortId);
          const dx = x2 - x1;
          const dy = y2 - y1;
          let cx1: number, cy1: number, cx2: number, cy2: number;
          if (Math.abs(dy) > Math.abs(dx)) {
            const bulge = Math.max(50, Math.abs(dy) * 0.3);
            cx1 = x1 + bulge;
            cy1 = y1 + dy * 0.25;
            cx2 = x2 + bulge;
            cy2 = y2 - dy * 0.25;
          } else {
            cx1 = x1 + dx * 0.5;
            cy1 = y1;
            cx2 = x1 + dx * 0.5;
            cy2 = y2;
          }
          for (let i = 0; i <= 10; i++) {
            const t = i / 10;
            const mt = 1 - t;
            pts.push({
              x:
                mt * mt * mt * x1 +
                3 * mt * mt * t * cx1 +
                3 * mt * t * t * cx2 +
                t * t * t * x2,
              y:
                mt * mt * mt * y1 +
                3 * mt * mt * t * cy1 +
                3 * mt * t * t * cy2 +
                t * t * t * y2,
            });
          }
        }
        if (pts.length === 0) continue;
        const t = Math.min(1, elapsed / duration);
        const idx = Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)));
        positions[run.id] = pts[idx];
      }
      setPacketPositions(positions);
      if (alive > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [packetRuns, edges, nodes]);

  useEffect(() => {
    handleGestureRef.current = (gesture: GestureDetail) => {
      handleGesture(gesture);
    };
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new InteractionEngine(
      containerRef.current,
      (gesture: GestureDetail) => {
        handleGestureRef.current(gesture);
      },
    );

    return () => {
      engine.destroy();
    };
  }, []);

  const handleGesture = (gesture: GestureDetail) => {
    // Kanvas terkunci (Lock): tolak gesture yang mengubah viewport/posisi node.
    // Klik/tap, kabel, selection tetap berfungsi.
    if (locked && (gesture.type === 'PAN' || gesture.type === 'PINCH' || gesture.type === 'NODE_DRAG' || gesture.type === 'SELECTION_BOX')) {
      return;
    }
    if (gesture.type === "PAN" && gesture.panDelta) {
      onViewportChange({
        ...viewport,
        x: viewport.x + gesture.panDelta.x,
        y: viewport.y + gesture.panDelta.y,
      });
    } else if (gesture.type === "PINCH" && gesture.scaleDelta) {
      const newZoom = Math.min(
        Math.max(viewport.zoom * gesture.scaleDelta, 0.25),
        3.0,
      );
      onViewportChange({
        ...viewport,
        zoom: newZoom,
      });
    } else if (
      gesture.type === "NODE_DRAG" &&
      gesture.dragDelta &&
      gesture.nodeId
    ) {
      const dx = gesture.dragDelta.x / viewport.zoom;
      const dy = gesture.dragDelta.y / viewport.zoom;

      const targetNode = nodes.find((n) => n.id === gesture.nodeId);
      const selectedNodes = nodes.filter(
        (n) => selectedNodeIds.includes(n.id) || n.selected || n.id === selectedNodeId,
      );
      const isTargetSelected =
        targetNode &&
        (selectedNodeIds.includes(targetNode.id) ||
          targetNode.selected ||
          targetNode.id === selectedNodeId);

      if (isTargetSelected && selectedNodes.length > 1) {
        selectedNodes.forEach((node) => {
          onNodePositionChange(node.id, {
            x: node.position.x + dx,
            y: node.position.y + dy,
          });
        });
      } else if (targetNode) {
        if (selectedNodeId !== targetNode.id && !targetNode.selected) {
          onSelectNode(targetNode.id);
        }
        onNodePositionChange(targetNode.id, {
          x: targetNode.position.x + dx,
          y: targetNode.position.y + dy,
        });
      }
    } else if (gesture.type === "TAP") {
      if (gesture.deleteEdgeId) {
        if (onDeleteEdge) onDeleteEdge(gesture.deleteEdgeId);
        return;
      }
      if (gesture.targetType === "port" && gesture.nodeId && gesture.portId) {
        onPortClick(gesture.nodeId, gesture.portId);
      } else if (gesture.targetType === "node" && gesture.nodeId) {
        if (cableWizard) {
          // Alur sambung kabel (ala Packet Tracer): klik perangkat lain sebagai tujuan
          if (cableWizard.sourceNodeId === gesture.nodeId) {
            setCableWizard(null); // klik sumber lagi = batal
          } else if (!cableWizard.targetNodeId && cableWizard.cableType && cableWizard.sourcePortId) {
            setCableWizard({ ...cableWizard, targetNodeId: gesture.nodeId });
          } else if (cableWizard.targetNodeId === gesture.nodeId) {
            setCableWizard(null);
          }
        } else if (activeTool === 'cable') {
          setCableWizard({ sourceNodeId: gesture.nodeId, sourcePortId: null, cableType: null, targetNodeId: null });
        } else if (gesture.shiftKey) {
          // Shift+klik → tambah/kurangi dari multi-select tanpa kehilangan seleksi lain
          if (onToggleNodeSelected) onToggleNodeSelected(gesture.nodeId);
          onSelectEdge(null);
        } else {
          onSelectNode(gesture.nodeId);
          onSelectEdge(null);
          if (onNodeTap) onNodeTap(gesture.nodeId);
        }
      } else if (gesture.targetType === "edge" && gesture.targetId) {
        onSelectEdge(gesture.targetId);
        onSelectNode(null);
      } else if (gesture.targetType === "canvas") {
        setCableWizard(null);
        // Selection box selesai (Shift+drag) → commit perangkat yang masuk kotak
        if (selectionRect && onSelectNodes) {
          const ids = nodesInSelectionRect(selectionRect, nodes, viewport);
          onSelectNodes(ids);
        } else {
          onSelectNode(null);
        }
        onSelectEdge(null);
        setSelectionRect(null);
      }
    } else if (gesture.type === "DOUBLE_TAP") {
      if (gesture.targetType === "node" && gesture.nodeId) {
        onOpenTerminal(gesture.nodeId);
      }
    } else if (gesture.type === "LONG_PRESS") {
      if (gesture.targetType === "node" && gesture.nodeId) {
        onSelectNode(gesture.nodeId);
        // Long-press = klik kanan: buka context menu perangkat
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          onContextMenu(
            {
              clientX: rect.left + gesture.point.x,
              clientY: rect.top + gesture.point.y,
              preventDefault: () => {},
            } as React.MouseEvent,
            "node",
            gesture.nodeId,
          );
        }
      }
    } else if (gesture.type === "CABLE_DRAG") {
      if (gesture.nodeId && gesture.portId) {
        const sourceNode = nodes.find((n) => n.id === gesture.nodeId);
        if (sourceNode) {
          const from = getEdgeAnchor(sourceNode, gesture.portId);
          setCableDrag({
            x1: from.x,
            y1: from.y,
            x2: (gesture.point.x - viewport.x) / viewport.zoom,
            y2: (gesture.point.y - viewport.y) / viewport.zoom,
          });
        }
      }
      setCableHover(gesture.hover || null);
    } else if (gesture.type === "SELECTION_BOX" && gesture.selectionRect) {
      setSelectionRect(gesture.selectionRect);
    } else if (gesture.type === "CABLE_CONNECT") {
      setCableDrag(null);
      setCableHover(null);
      setCableWizard(null);
      if (gesture.nodeId && gesture.portId && gesture.targetNodeId && gesture.targetPortId) {
        // Jangan langsung sambung: minta konfirmasi tipe kabel dulu (dropdown).
        const srcNode = nodes.find((n) => n.id === gesture.nodeId);
        const tgtNode = nodes.find((n) => n.id === gesture.targetNodeId);
        const srcPort = srcNode?.ports.find((p) => p.id === gesture.portId);
        const tgtPort = tgtNode?.ports.find((p) => p.id === gesture.targetPortId);
        const inferred = inferCableType(
          srcNode?.deviceType ?? '',
          tgtNode?.deviceType ?? '',
          srcPort?.type,
          tgtPort?.type
        );
        setCableDraft({
          srcNodeId: gesture.nodeId,
          srcPortId: gesture.portId,
          tgtNodeId: gesture.targetNodeId,
          tgtPortId: gesture.targetPortId,
          inferred,
          selected: inferred,
        });
      }
    } else if (gesture.type === "CABLE_CANCEL") {
      setCableDrag(null);
      setCableHover(null);
    }
  };

  /** Informasi koneksi sebuah port: nama remote "Node:port" atau null bila kosong. */
  const getPortConnection = (nodeId: string, portId: string): string | null => {
    const edge = edges.find(
      (e) =>
        (e.sourceNodeId === nodeId && e.sourcePortId === portId) ||
        (e.targetNodeId === nodeId && e.targetPortId === portId)
    );
    if (!edge) return null;
    const isSource = edge.sourceNodeId === nodeId;
    const remote = nodes.find((n) => n.id === (isSource ? edge.targetNodeId : edge.sourceNodeId));
    const port = remote?.ports.find((p) => p.id === (isSource ? edge.targetPortId : edge.sourcePortId));
    if (!remote) return null;
    return `${remote.name}:${port?.name ?? (isSource ? edge.targetPortId : edge.sourcePortId)}`;
  };

  /** Warna garis sesuai tipe kabel (sama dengan rendering edge). */
  const cableColorOf = (t: string | null | undefined): string => {
    if (t === "fiber") return "#4CAF50";
    return "#2196F3";
  };

  // ── Skema warna kabel (Tugas 1 — Connection Color-Coding) ──
  // Access/Ethernet   : solid biru #2196F3
  // Trunk (VLAN)      : dashed oranye #FF9800
  // Fiber optik       : solid hijau #4CAF50
  // Link down / error : merah #F44336
  const isTrunkEdge = (edge: LabEdge): boolean => {
    const hasTrunk = (nodeId: string, portId: string) => {
      const trunks = trunkPortsByNode[nodeId];
      if (!trunks || trunks.length === 0) return false;
      const node = nodes.find((n) => n.id === nodeId);
      const portName = node?.ports.find((p) => p.id === portId)?.name ?? portId;
      return trunks.includes(portName) || trunks.includes(portId);
    };
    return hasTrunk(edge.sourceNodeId, edge.sourcePortId) || hasTrunk(edge.targetNodeId, edge.targetPortId);
  };

  const cableStroke = (edge: LabEdge, isSelected: boolean, isHovered: boolean, isHoverConnected: boolean): string => {
    if (isSelected) return "#F44336"; // terpilih: merah agar menonjol
    if (edge.down) return "#F44336"; // link down: merah
    if (isHovered || isHoverConnected) return "#FFB300"; // hover: kuning
    if (isTrunkEdge(edge)) return "#FF9800"; // trunk: oranye
    if (edge.cableType === "fiber") return "#4CAF50"; // fiber: hijau
    return "#2196F3"; // access/ethernet biasa: biru
  };

  const cableDash = (edge: LabEdge): string => {
    if (edge.down) return "8,4"; // error/down: putus-putus tegas
    if (isTrunkEdge(edge)) return "8,6"; // trunk: dashed (markah VLAN)
    if (edge.cableType === "serial") return "2,4";
    return "none";
  };

  const getNodeIcon = (deviceType: string) => {    switch (deviceType) {
      case "switch":
        return <HardDrive className="w-4 h-4 text-blue-400" />;
      case "firewall":
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case "pc":
        return <Laptop className="w-4 h-4 text-emerald-400" />;
      case "server":
        return <Server className="w-4 h-4 text-purple-400" />;
      case "wireless":
        return <Wifi className="w-4 h-4 text-cyan-400" />;
      case "router":
      default:
        return <Router className="w-4 h-4 text-sky-400" />;
    }
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => {
        e.preventDefault();
        // Resolve target (node/edge) dari elemen yang diklik kanan
        let target = e.target as HTMLElement | null;
        while (target && target !== containerRef.current) {
          if (target.dataset.edgeId) {
            onContextMenu(e, 'edge', target.dataset.edgeId);
            return;
          }
          if (target.dataset.nodeId) {
            onContextMenu(e, 'node', target.dataset.nodeId);
            return;
          }
          target = target.parentElement;
        }
        onContextMenu(e);
      }}
      onPointerMove={(e) => {
        if (!cableWizard) {
          if (pointerWorld) setPointerWorld(null);
          return;
        }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPointerWorld({
          x: (e.clientX - rect.left - viewport.x) / viewport.zoom,
          y: (e.clientY - rect.top - viewport.y) / viewport.zoom,
        });
      }}
      className={`relative w-full h-full overflow-hidden select-none touch-none active:cursor-grabbing ${
        theme === "dark"
          ? "bg-[#0B0C0E] text-slate-100"
          : "bg-[#F4F5F8] text-slate-900"
      } ${!activeTool || activeTool === 'pan' ? 'cursor-grab' : 'cursor-default'}`}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle, ${theme === "dark" ? "#22232B" : "#D1D5DB"} 1px, transparent 1px)`,
          backgroundSize: `${30 * viewport.zoom}px ${30 * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
      />

      <svg
        className="absolute inset-0 w-full h-full z-10 overflow-visible"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {edges.map((edge) => {
          const sourceNode = nodes.find((n) => n.id === edge.sourceNodeId);
          const targetNode = nodes.find((n) => n.id === edge.targetNodeId);
          if (!sourceNode || !targetNode) return null;
          const { x: x1, y: y1 } = getEdgeAnchor(sourceNode, edge.sourcePortId);
          const { x: x2, y: y2 } = getEdgeAnchor(targetNode, edge.targetPortId);
          const dx = x2 - x1;
          const dy = y2 - y1;
          
          let cx1, cy1, cx2, cy2;
          // If the devices are mostly vertically aligned
          if (Math.abs(dy) > Math.abs(dx)) {
            // Curve out to the side by a factor of the vertical distance (min 50px)
            const bulge = Math.max(50, Math.abs(dy) * 0.3);
            // Alternate left/right based on some criteria, or just always right
            // but if x2 < x1 we can bulge left
            const direction = x1 > 200 ? 1 : -1; // just an arbitrary visual direction
            cx1 = x1 + bulge;
            cy1 = y1 + dy * 0.25;
            cx2 = x2 + bulge;
            cy2 = y2 - dy * 0.25;
          } else {
            // Horizontal connection
            cx1 = x1 + dx * 0.5;
            cy1 = y1;
            cx2 = x1 + dx * 0.5;
            cy2 = y2;
          }
          const isSelected = edge.id === selectedEdgeId;
          const isHoveredEdge = hoveredEdgeId === edge.id;
          const isHoverConnected =
            hoverNodeId !== null &&
            (edge.sourceNodeId === hoverNodeId || edge.targetNodeId === hoverNodeId);
          const isWireless =
            sourceNode.deviceType === 'wireless' ||
            targetNode.deviceType === 'wireless';
          const tMid = 0.5;
          const mtMid = 1 - tMid;
          const edgeMx = mtMid * mtMid * mtMid * x1 + 3 * mtMid * mtMid * tMid * cx1 + 3 * mtMid * tMid * tMid * cx2 + tMid * tMid * tMid * x2;
          const edgeMy = mtMid * mtMid * mtMid * y1 + 3 * mtMid * mtMid * tMid * cy1 + 3 * mtMid * tMid * tMid * cy2 + tMid * tMid * tMid * y2;

          if (isWireless) {
            // Draw animated dashed Bezier curve with Wifi icon at center
            const arcColor = isSelected ? '#ef4444' : isHoveredEdge ? '#fbbf24' : '#22d3ee';
            // Calculate bezier midpoint (t = 0.5)
            const t = 0.5;
            const mt1 = 1 - t;
            const mx = Math.pow(mt1, 3) * x1 + 3 * Math.pow(mt1, 2) * t * cx1 + 3 * mt1 * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
            const my = Math.pow(mt1, 3) * y1 + 3 * Math.pow(mt1, 2) * t * cy1 + 3 * mt1 * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;

            return (
              <g key={edge.id} data-edge-id={edge.id} className="cursor-pointer pointer-events-auto"
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId((cur) => (cur === edge.id ? null : cur))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(e as any, 'edge', edge.id);
                }}
              >
                {/* hit-area */}
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                />
                
                {/* pulsing dashed connection line */}
                <path
                  d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={arcColor}
                  strokeWidth={isSelected ? "4" : isHoveredEdge || isHoverConnected ? "4" : "2.5"}
                  strokeDasharray="8 8"
                  className="transition-all"
                  style={isHoveredEdge || isHoverConnected ? { filter: "drop-shadow(0 0 5px rgba(34,211,238,0.8))" } : undefined}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="16"
                    to="0"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </path>
                
                {/* Wifi icon at center */}
                <foreignObject x={mx - 12} y={my - 12} width={24} height={24} className="pointer-events-none">
                  <div className="flex items-center justify-center w-full h-full bg-slate-900 rounded-full shadow-lg border border-slate-700/50">
                    <Wifi className={`w-3.5 h-3.5 ${isSelected ? 'text-red-400' : 'text-cyan-400'} animate-pulse`} />
                  </div>
                </foreignObject>

                {/* Tombol hapus kabel — muncul saat node di-hover atau kabel dipilih */}
                {(isHoveredEdge || isSelected) && (
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEdge?.(edge.id);
                    }}
                  >
                    <circle cx={mx} cy={my} r="11" fill="#1A1D24" stroke="#f43f5e" strokeWidth="1.5" />
                    <text x={mx} y={my + 3.5} textAnchor="middle" fontSize="10" fill="#f43f5e" fontWeight="bold" className="select-none pointer-events-none">
                      ✕
                    </text>
                  </g>
                )}

                {/* endpoint dots */}
                <circle cx={x1} cy={y1} r="4" fill={arcColor} />
                <circle cx={x2} cy={y2} r="4" fill={arcColor} />
              </g>
            );
          }

          return (
            <g key={edge.id} data-edge-id={edge.id} className="cursor-pointer pointer-events-auto"
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() => setHoveredEdgeId((cur) => (cur === edge.id ? null : cur))}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e as any, 'edge', edge.id);
              }}
            >
              <path
                data-edge-id={edge.id}
                d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                fill="none"
                stroke={cableStroke(edge, isSelected, isHoveredEdge, isHoverConnected)}
                strokeWidth={isSelected ? "5" : isHoveredEdge || isHoverConnected ? "4.5" : "3"}
                strokeDasharray={cableDash(edge)}
                className="transition-all hover:stroke-[4px]"
                style={isHoveredEdge || (isHoverConnected && !isSelected) ? { filter: "drop-shadow(0 0 5px currentColor)" } : undefined}
              />
              <path
                data-edge-id={edge.id}
                d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
              />
              <circle cx={x1} cy={y1} r="4" fill={cableStroke(edge, isSelected, isHoveredEdge, isHoverConnected)} />
              <circle cx={x2} cy={y2} r="4" fill={cableStroke(edge, isSelected, isHoveredEdge, isHoverConnected)} />

              {/* Label interface di ujung kabel (kabel terpilih) */}
              {isSelected && (
                <>
                  <text
                    x={x1}
                    y={y1 - 8}
                    textAnchor={x2 > x1 ? "end" : "start"}
                    fontSize="10"
                    fill="#FFB300"
                    className="select-none"
                    stroke="#0B0C0E"
                    strokeWidth="3"
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    {sourceNode.ports.find((p) => p.id === edge.sourcePortId)?.name ?? edge.sourcePortId}
                  </text>
                  <text
                    x={x2}
                    y={y2 - 8}
                    textAnchor={x2 > x1 ? "start" : "end"}
                    fontSize="10"
                    fill="#FFB300"
                    className="select-none"
                    stroke="#0B0C0E"
                    strokeWidth="3"
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    {targetNode.ports.find((p) => p.id === edge.targetPortId)?.name ?? edge.targetPortId}
                  </text>
                </>
              )}

              {/* Badge trunk kecil di tengah kabel */}
              {isTrunkEdge(edge) && (
                <g pointerEvents="none">
                  <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r="7" fill="#0F1015" stroke="#FF9800" strokeWidth="1.2" opacity="0.95" />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 + 3}
                    textAnchor="middle"
                    fontSize="7.5"
                    fill="#FF9800"
                    fontWeight="bold"
                  >
                    TRK
                  </text>
                </g>
              )}

              {/* Tombol hapus kabel — muncul saat node di-hover atau kabel dipilih */}
              {(isHoveredEdge || isSelected) && (
                <g
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEdge?.(edge.id);
                  }}
                >
                  <circle cx={edgeMx} cy={edgeMy} r="11" fill="#1A1D24" stroke="#f43f5e" strokeWidth="1.5" />
                  <text x={edgeMx} y={edgeMy + 3.5} textAnchor="middle" fontSize="10" fill="#f43f5e" fontWeight="bold" className="select-none pointer-events-none">
                    ✕
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Rubber-band line while dragging a cable between ports */}
        {cableDrag && (
          <g pointerEvents="none">
            <path
              d={`M ${cableDrag.x1} ${cableDrag.y1} C ${cableDrag.x1 + 40} ${cableDrag.y1}, ${cableDrag.x2 - 40} ${cableDrag.y2}, ${cableDrag.x2} ${cableDrag.y2}`}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.5"
              strokeDasharray="7 5"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="24"
                to="0"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </path>
            <circle cx={cableDrag.x1} cy={cableDrag.y1} r="5" fill="#22d3ee" />
            <circle cx={cableDrag.x2} cy={cableDrag.y2} r="6" fill="#22d3ee" opacity="0.7" />
          </g>
        )}

        {/* Ghost cable — wizard kabel ala Packet Tracer, mengikuti cursor */}
        {cableWizard && cableWizard.sourcePortId && cableWizard.cableType && pointerWorld && (() => {
          const srcNode = nodes.find((n) => n.id === cableWizard.sourceNodeId);
          if (!srcNode) return null;
          const anchor = getEdgeAnchor(srcNode, cableWizard.sourcePortId);
          const tgtNode = cableWizard.targetNodeId ? nodes.find((n) => n.id === cableWizard.targetNodeId) : null;
          const end = tgtNode
            ? { x: tgtNode.position.x + NODE_W / 2, y: tgtNode.position.y + NODE_H / 2 }
            : pointerWorld;
          const col = cableColorOf(cableWizard.cableType);
          return (
            <g pointerEvents="none">
              <path
                d={`M ${anchor.x} ${anchor.y} C ${anchor.x + 60} ${anchor.y}, ${end.x - 60} ${end.y}, ${end.x} ${end.y}`}
                fill="none"
                stroke={col}
                strokeWidth="2.5"
                strokeDasharray="7 5"
                style={{ filter: `drop-shadow(0 0 4px ${col})` }}
              >
                <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite" />
              </path>
              <circle cx={anchor.x} cy={anchor.y} r="5" fill={col} />
              <circle cx={end.x} cy={end.y} r="6" fill={col} opacity="0.75" />
              {tgtNode && (
                <circle cx={end.x} cy={end.y} r="12" fill="none" stroke={col} strokeWidth="1.5" strokeDasharray="3 3" />
              )}
            </g>
          );
        })()}

        {/* Panel properti kabel — pada kabel terpilih */}
        {(() => {
          const edge = edges.find((e) => e.id === selectedEdgeId);
          if (!edge) return null;
          const sNode = nodes.find((n) => n.id === edge.sourceNodeId);
          const tNode = nodes.find((n) => n.id === edge.targetNodeId);
          if (!sNode || !tNode) return null;
          const { x: x1, y: y1 } = getEdgeAnchor(sNode, edge.sourcePortId);
          const { x: x2, y: y2 } = getEdgeAnchor(tNode, edge.targetPortId);
          const dx = x2 - x1;
          const dy = y2 - y1;
          let cx1, cy1, cx2, cy2;
          if (Math.abs(dy) > Math.abs(dx)) {
            const bulge = Math.max(50, Math.abs(dy) * 0.3);
            cx1 = x1 + bulge;
            cy1 = y1 + dy * 0.25;
            cx2 = x2 + bulge;
            cy2 = y2 - dy * 0.25;
          } else {
            cx1 = x1 + dx * 0.5;
            cy1 = y1;
            cx2 = x1 + dx * 0.5;
            cy2 = y2;
          }
          const t = 0.5;
          const mt = 1 - t;
          const mx = mt * mt * mt * x1 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x2;
          const my = mt * mt * mt * y1 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y2;
          const panelW = 196;
          return (
            <g pointerEvents="none">
              <foreignObject x={mx - panelW / 2} y={my - 64} width={panelW} height={128}>
                <div className="pointer-events-auto bg-[#0F1015]/95 backdrop-blur-md border border-red-500/40 rounded-lg shadow-2xl px-2.5 py-2 text-[11px] font-mono">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/10 mb-1.5">
                    <span className="text-[10px] text-slate-400 truncate">{sNode.name} ↔ {tNode.name}</span>
                    <button
                      data-delete-edge-id={edge.id}
                      title="Delete Cable"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEdge?.(edge.id);
                      }}
                      className="p-1 rounded-md bg-rose-600/80 hover:bg-rose-500 text-white shrink-0 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-slate-400 w-14 shrink-0">Latency</label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={edge.latencyMs ?? ""}
                      placeholder="auto"
                      onChange={(e) => onUpdateEdge?.(edge.id, { latencyMs: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
                      className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-cyan-200 focus:outline-none focus:border-cyan-500/60"
                    />
                    <span className="text-slate-500 shrink-0">ms</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label className="text-slate-400 w-14 shrink-0">Link</label>
                    <select
                      value={`${edge.bandwidthMbps ?? ""}`}
                      onChange={(e) => onUpdateEdge?.(edge.id, { bandwidthMbps: e.target.value === "" ? undefined : Number(e.target.value) })}
                      className="w-full min-w-0 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                    >
                      <option value="">auto</option>
                      <option value="10">10 Mbps</option>
                      <option value="100">100 Mbps</option>
                      <option value="1000">1 Gbps</option>
                      <option value="10000">10 Gbps</option>
                    </select>
                  </div>
                  <button
                    onClick={() => onUpdateEdge?.(edge.id, { down: !edge.down })}
                    className={`w-full rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                      edge.down
                        ? "bg-red-600/30 text-red-300 border border-red-500/40"
                        : "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {edge.down ? "● Link Down — klik untuk aktifkan" : "○ Link Active — klik untuk downkan"}
                  </button>
                </div>
              </foreignObject>
            </g>
          );
        })()}

        {/* Paket ping yang melintasi kabel (cyan=request/reply, merah=gagal) */}
        {Object.entries(packetPositions).map(([id, pos]) => {
          const run = packetRuns.find((r) => r.id === id);
          const isRed = run?.red === true;
          return (
            <circle
              key={id}
              cx={(pos as { x: number; y: number }).x}
              cy={(pos as { x: number; y: number }).y}
              r={isRed ? 6 : 5}
              fill={isRed ? "#F44336" : "#22d3ee"}
              stroke={isRed ? "#FFF1F1" : "#0B0C0E"}
              strokeWidth="1"
              className="animate-pulse"
              style={{
                filter: isRed
                  ? "drop-shadow(0 0 8px rgba(244,67,54,0.95))"
                  : "drop-shadow(0 0 6px rgba(34,211,238,0.9))",
              }}
            />
          );
        })}
      </svg>

      {/* Cable hover tooltip: tampilkan perangkat & port yang dihubungkan kabel */}
      {(() => {
        if (!hoveredEdgeId) return null;
        const edge = edges.find((e) => e.id === hoveredEdgeId);
        if (!edge) return null;
        const sNode = nodes.find((n) => n.id === edge.sourceNodeId);
        const tNode = nodes.find((n) => n.id === edge.targetNodeId);
        if (!sNode || !tNode) return null;
        const { x: ax, y: ay } = getEdgeAnchor(sNode, edge.sourcePortId);
        const { x: bx, y: by } = getEdgeAnchor(tNode, edge.targetPortId);
        const adx = bx - ax;
        const ady = by - ay;
        let acx1, acy1, acx2, acy2;
        if (Math.abs(ady) > Math.abs(adx)) {
          const bulge = Math.max(50, Math.abs(ady) * 0.3);
          const direction = ax > 200 ? 1 : -1;
          acx1 = ax + bulge;
          acy1 = ay + ady * 0.25;
          acx2 = bx + bulge;
          acy2 = by - ady * 0.25;
        } else {
          acx1 = ax + adx * 0.5;
          acy1 = ay;
          acx2 = ax + adx * 0.5;
          acy2 = by;
        }
        const mx = (ax + 3 * acx1 + 3 * acx2 + bx) / 8;
        const my = (ay + 3 * acy1 + 3 * acy2 + by) / 8;
        const sPort = sNode.ports.find((p) => p.id === edge.sourcePortId);
        const tPort = tNode.ports.find((p) => p.id === edge.targetPortId);
        const portLabel = (name: string, port?: { name: string }) => port ? `${name}:${port.name}` : `${name}:${edge.sourcePortId}`;
        const cableLabel = edge.cableType === 'copper_straight' ? 'Copper Straight'
          : edge.cableType === 'copper_cross' ? 'Copper Crossover'
          : edge.cableType === 'fiber' ? 'Fiber Optic' : 'Serial';
        const cw = containerRef.current?.clientWidth ?? 800;
        const sx = mx * viewport.zoom + viewport.x;
        const sy = my * viewport.zoom + viewport.y;
        return (
          <div
            className="pointer-events-none absolute z-40"
            style={{
              left: Math.min(Math.max(sx, 70), cw - 70),
              top: Math.max(sy, 16),
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <div className="bg-[#0F1015]/95 backdrop-blur-md border border-amber-400/40 rounded-lg shadow-2xl px-3 py-2 text-[11px] font-mono whitespace-nowrap">
              <div className="flex items-center gap-1.5 text-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="truncate max-w-[180px]">{portLabel(sNode.name, sPort)}</span>
                <span className="text-amber-400">↔</span>
                <span className="truncate max-w-[180px]">{portLabel(tNode.name, tPort)}</span>
              </div>
              <div className="mt-1 text-[9px] text-slate-400 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300">
                  {cableLabel}
                </span>
                <span>{edge.sourcePortId.slice(0, 8)} ↔ {edge.targetPortId.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Node Layer */}
      <div
        className="absolute inset-0 pointer-events-auto z-20"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {nodes.map((node) => {
          const isSelected =
            selectedNodeId === node.id ||
            node.selected ||
            selectedNodeIds.includes(node.id);
          const nodeInCableFlow =
            activeTool === 'cable' ||
            cableWizard?.sourceNodeId === node.id ||
            cableWizard?.targetNodeId === node.id;
          const isWizardSource = cableWizard?.sourceNodeId === node.id;
          const isWizardTarget = cableWizard?.targetNodeId === node.id;
          const nodeCableCount = edges.filter(
            (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id
          ).length;
          const nodeEdges = edges.filter(
            (e) => e.sourceNodeId === node.id || e.targetNodeId === node.id
          );
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              onMouseEnter={() => setHoverNodeId(node.id)}
              onMouseLeave={() => setHoverNodeId((h) => (h === node.id ? null : h))}
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`,
                width: `${NODE_W}px`,
                height: `${NODE_H}px`,
                opacity: node.powered === false ? 0.45 : 1,
                filter: node.powered === false ? 'grayscale(0.7)' : undefined,
              }}
              className={`absolute flex flex-col items-center justify-center p-2 rounded-lg group transition-all ${
                node.powered === false ? '' : activeTool === 'cable' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
              } ${
                cableWizard?.sourceNodeId === node.id
                  ? "bg-blue-500/10 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  : isSelected
                    ? theme === 'dark'
                      ? "bg-white/[0.03] border border-white/10"
                      : "bg-slate-900/5 border border-slate-400/40"
                    : theme === 'dark'
                      ? "hover:bg-white/[0.02] border border-transparent"
                      : "hover:bg-slate-900/5 border border-transparent"
              } ${cableWizard?.targetNodeId === node.id ? "border border-cyan-400/60 bg-cyan-500/10" : ""}`}
            >
              <div className="pointer-events-none flex items-center justify-center w-12 h-12 bg-[#1A1D24] border border-[#2B2D31] rounded-lg shadow-sm mb-2 group-hover:border-[#4B4D51] transition-colors relative">
                {getNodeIcon(node.deviceType)}
                {/* Status indicator: hijau normal · kuning sedang diuji · merah mati/gagal */}
                <span
                  className={`absolute -top-1.5 -right-1.5 rounded-full border border-[#1A1D24] ${
                    node.powered === false || failedPingNodeIds.includes(node.id)
                      ? 'w-3 h-3 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse'
                      : pingingNodeIds.includes(node.id)
                        ? 'w-2.5 h-2.5 bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)] animate-pulse'
                        : 'w-2 h-2 bg-emerald-500'
                  }`}
                />
              </div>
              <div className="text-center pointer-events-none flex flex-col items-center">
                <span className={`text-[11px] font-medium tracking-tight leading-tight max-w-[88px] truncate ${
                  theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
                }`}>{node.name}</span>
                <span className={`text-[9px] font-mono mt-0.5 max-w-[88px] truncate ${
                  theme === 'dark' ? 'text-slate-500' : 'text-slate-500'
                }`}>{node.model}</span>
              </div>

              {/* Port dots - hanya terlihat saat mode kabel aktif atau sedang menyambung */}
              {node.ports.map((port, idx) => {
                const side = portSide(port, idx);
                const slot = portSlot(port, idx);
                const isCableStart = cableStart?.nodeId === node.id && cableStart?.portId === port.id;
                const isHover = cableHover?.nodeId === node.id && cableHover?.portId === port.id;
                const portConn = getPortConnection(node.id, port.id);
                const isWizardPort = isWizardSource && cableWizard?.sourcePortId === port.id;
                return (
                  <div
                    key={port.id}
                    data-node-id={node.id}
                    data-port-id={port.id}
                    title={`${port.name} (${port.status})${portConn ? ` → ${portConn}` : ' — kosong'}`}
                    className={`absolute w-4 h-4 flex items-center justify-center z-40 cursor-crosshair touch-none ${
                      side === "left" ? "-left-2" : "-right-2"
                    } ${nodeInCableFlow ? "opacity-100" : "opacity-0"} transition-opacity`}
                    style={{ top: `${PORT_TOP + slot * PORT_GAP - 8}px` }}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full border transition-all ${
                        port.status === "up"
                          ? "bg-emerald-500 border-emerald-300/70"
                          : "bg-slate-600 border-slate-500"
                      } ${isCableStart ? "ring-2 ring-blue-400 scale-125" : ""} ${
                        isHover ? "ring-2 ring-cyan-300 scale-125" : ""
                      } ${isWizardPort ? "ring-2 ring-blue-400 scale-125" : ""} ${
                        nodeInCableFlow ? "hover:ring-2 hover:ring-cyan-300 hover:scale-125" : ""
                      } ${portConn && nodeInCableFlow ? "ring-2 ring-rose-500/70" : ""}`}
                    />
                  </div>
                );
              })}
              
              {/* Tombol aksi node — SEMBUNYI hanya saat node ini sedang jadi sumber/tujuan
                  wizard kabel, agar tidak menutupi titik port. */}
              {!(isWizardSource || isWizardTarget) && (
                <>
              {/* Open CLI button — selalu terlihat agar tidak "hilang" */}
              <button
                className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 bg-[#1A1D24] border border-[#2B2D31] rounded-md text-emerald-400 hover:text-white hover:border-emerald-500 transition-opacity z-[60] opacity-90 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal(node.id);
                }}
                title="Open CLI"
              >
                <TerminalSquare className="w-3 h-3" />
              </button>

              {/* Connect Cable button — mulai wizard kabel (klik perangkat juga bisa di mode cable) */}
              <button 
                className="absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 bg-[#1A1D24] border border-[#2B2D31] rounded-md text-sky-400 hover:text-white hover:border-blue-500 transition-opacity z-[60] opacity-90 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setCableWizard({ sourceNodeId: node.id, sourcePortId: null, cableType: null, targetNodeId: null });
                }}
                title="Sambungkan Kabel"
              >
                <Plus className="w-3 h-3" />
              </button>

              {/* Hapus semua kabel node ini — hanya muncul jika node punya kabel */}
              {nodeCableCount > 0 && (
                <button
                  className="absolute -right-8 top-[calc(50%+18px)] -translate-y-1/2 p-1.5 bg-[#1A1D24] border border-rose-800 rounded-md text-rose-400 hover:text-white hover:border-rose-500 transition-opacity z-[60] opacity-90 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNodeCables?.(node.id);
                  }}
                  title={`Hapus semua kabel node ini (${nodeCableCount})`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
                </>
              )}
              
              {/* Panel Lihat Port — kabel terhubung di port mana saja */}
              {hoverNodeId === node.id || (viewPorts && isSelected) ? (
                <div
                  className={`absolute top-0 z-50 w-52 bg-[#0F1015]/95 backdrop-blur-md border border-cyan-500/30 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100 ${
                    viewPorts ? 'border-slate-500/40' : ''
                  }`}
                  style={{
                    left: node.position.x + viewport.x + NODE_W > (containerRef.current?.clientWidth ?? 900) - 200
                      ? 'auto'
                      : 'calc(100% + 12px)',
                    right:
                      node.position.x + viewport.x + NODE_W > (containerRef.current?.clientWidth ?? 900) - 200
                        ? 'calc(100% + 12px)'
                        : 'auto',
                  }}
                >
                  <div className="px-2.5 py-1.5 border-b border-[#2B2D31] flex items-center justify-between bg-[#1A1D24]/80">
                    <span className="text-[10px] font-semibold text-slate-200">
                      Port & Kabel — {node.name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      {node.ports.length} port
                    </span>
                  </div>
                  <div className="p-1 max-h-56 overflow-y-auto">
                    {node.ports.length === 0 && (
                      <div className="px-2 py-2 text-[9px] text-slate-500 text-center">No ports available</div>
                    )}
                    {node.ports.map((port) => {
                      const conn = getPortConnection(node.id, port.id);
                      return (
                        <div
                          key={port.id}
                          className="flex items-center justify-between gap-2 px-2 py-[3px] text-[9.5px] font-mono rounded hover:bg-white/5"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${
                                port.status === 'up' ? 'bg-emerald-500' : 'bg-slate-600'
                              }`}
                            />
                            <span className="text-slate-300 truncate">{port.name}</span>
                          </span>
                          <span
                            className={`truncate text-right ${
                              conn ? 'text-cyan-300' : 'text-slate-600'
                            }`}
                            title={port.ipAddress ? `IP ${port.ipAddress}` : 'No cable connected · tanpa IP'}
                          >
                            {conn ? `→ ${conn}` : 'No cable connected'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-2.5 py-1.5 border-t border-[#2B2D31] bg-[#1A1D24]/60">
                    <div className="flex items-center gap-1">
                      <select
                        value=""
                        onChange={(e) => {
                          const target = e.target.value;
                          if (target) onDeleteEdge?.(target);
                        }}
                        className="flex-1 min-w-0 bg-[#1A1D24] border border-[#2B2D31] rounded-md text-[9.5px] font-mono px-1.5 py-1 text-slate-200 outline-none focus:border-rose-500/60"
                        title="Pilih kabel yang ingin dihapus"
                      >
                        <option value="">Hapus kabel (pilih port)…</option>
                        {nodeEdges.length === 0 && <option value="" disabled>— tidak ada kabel terpasang —</option>}
                        {nodeEdges.map((e) => {
                          const sN = nodes.find((n) => n.id === e.sourceNodeId);
                          const tN = nodes.find((n) => n.id === e.targetNodeId);
                          const label = `${sN?.name ?? e.sourceNodeId}:${e.sourcePortId} ↔ ${tN?.name ?? e.targetNodeId}:${e.targetPortId}`;
                          return (
                            <option key={e.id} value={e.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="px-0.5 pt-1 text-[8.5px] font-mono text-slate-600">
                      Menghapus kabel tidak menghapus konfigurasi port — status port menjadi "No cable connected".
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Wizard Kabel — langkah 1: pilih tipe kabel (wajib) lalu port sumber */}
              {isWizardSource && !isWizardTarget && (
                <WizardPopover className="absolute left-[calc(100%+12px)] top-0 z-50 w-44 bg-[#0F1015]/95 backdrop-blur-md border border-blue-500/30 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-2 border-b border-[#2B2D31] flex items-center justify-between bg-[#1A1D24]/80">
                    <span className="text-[10px] font-semibold text-slate-200">Sambungkan Kabel</span>
                    <button onClick={() => setCableWizard(null)} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-1.5">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      1. Tipe Kabel <span className="text-rose-400">*wajib</span>
                    </label>
                    <select
                      value={cableWizard.cableType ?? ''}
                      onChange={(e) =>
                        setCableWizard({ ...cableWizard, cableType: e.target.value || null, sourcePortId: null })
                      }
                      className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md text-[10px] px-1.5 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 mb-2"
                    >
                      <option value="">— pilih tipe —</option>
                      <option value="copper_straight">Straight (UTP)</option>
                      <option value="copper_cross">Cross (UTP)</option>
                      <option value="fiber">Fiber Optik</option>
                      <option value="serial">Serial</option>
                    </select>
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      2. Port Sumber
                    </label>
                    {!cableWizard.cableType && (
                      <div className="px-2 py-2 text-[9px] text-slate-500 text-center">
                        Pilih tipe kabel dulu
                      </div>
                    )}
                    <div className="max-h-36 overflow-y-auto">
                      {cableWizard.cableType &&
                        node.ports.map((port) => {
                          const busy = getPortConnection(node.id, port.id) !== null;
                          const active = cableWizard.sourcePortId === port.id;
                          const match = cableMatchesPort(cableWizard.cableType, port.type);
                          return (
                            <button
                              key={port.id}
                              disabled={busy || !match}
                              onClick={() => setCableWizard({ ...cableWizard, sourcePortId: port.id })}
                              className={`w-full text-left px-2 py-1.5 text-[10px] font-mono rounded flex items-center justify-between mb-0.5 border transition-colors ${
                                active
                                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                  : busy || !match
                                    ? "text-slate-600 border border-transparent cursor-not-allowed"
                                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
                              }`}
                            >
                              <span className="truncate pr-2">{port.name}</span>
                              <span className="flex items-center gap-1">
                                {busy ? (
                                  <span className="text-[8px] text-slate-600">terpakai</span>
                                ) : !match ? (
                                  <span className="text-[8px] text-slate-600">{port.type ?? 'copper'} ≠ kabel</span>
                                ) : null}
                                <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${port.status === 'up' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                              </span>
                            </button>
                          );
                        })}
                    </div>
                    <div className="mt-1.5 px-1 py-1 text-[9px] font-mono text-cyan-300/80 bg-cyan-500/10 rounded border border-cyan-500/20">
                      {cableWizard.sourcePortId
                        ? `Sumber: ${node.name}:${cableWizard.sourcePortId} — klik perangkat tujuan`
                        : 'Tarik kabel mengikuti cursor → klik perangkat tujuan'}
                    </div>
                  </div>
                </WizardPopover>
              )}

              {/* Wizard Kabel — langkah 2: pilih port tujuan */}
              {isWizardTarget && (
                <WizardPopover className="absolute left-[calc(100%+12px)] top-0 z-50 w-44 bg-[#0F1015]/95 backdrop-blur-md border border-cyan-500/30 rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-2 border-b border-[#2B2D31] flex items-center justify-between bg-[#1A1D24]/80">
                    <span className="text-[10px] font-semibold text-slate-200">
                      Pilih Port Tujuan — {node.name}
                    </span>
                    <button onClick={() => setCableWizard(null)} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-1.5">
                    <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                      Tipe Kabel
                    </label>
                    <select
                      value={cableWizard.cableType ?? ''}
                      onChange={(e) =>
                        setCableWizard({ ...cableWizard, cableType: e.target.value || null })
                      }
                      className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md text-[10px] px-1.5 py-1.5 text-slate-200 outline-none focus:border-cyan-500/60 mb-1.5"
                    >
                      <option value="copper_straight">Straight (UTP)</option>
                      <option value="copper_cross">Cross (UTP)</option>
                      <option value="fiber">Fiber Optik</option>
                      <option value="serial">Serial</option>
                    </select>
                    <div className="px-1 py-0.5 text-[8.5px] font-mono text-slate-500 mb-1">
                      Hanya port yang cocok dengan {cableWizard.cableType === 'fiber' ? 'fiber' : cableWizard.cableType === 'serial' ? 'serial' : 'copper'} yang bisa dipilih
                    </div>
                  </div>
                  <div className="px-1.5 pb-1.5">
                    <div className="max-h-36 overflow-y-auto">
                      {node.ports.length === 0 && (
                        <div className="px-2 py-2 text-[9px] text-slate-500 text-center">No ports available</div>
                      )}
                      {node.ports.map((port) => {
                        const busy = getPortConnection(node.id, port.id) !== null;
                        const match = cableMatchesPort(cableWizard.cableType, port.type);
                        return (
                          <button
                            key={port.id}
                            disabled={busy || !match}
                            onClick={() => {
                              if (!cableWizard.cableType || !cableWizard.sourcePortId) return;
                              onCableConnect(
                                { nodeId: cableWizard.sourceNodeId, portId: cableWizard.sourcePortId },
                                { nodeId: node.id, portId: port.id },
                                cableWizard.cableType
                              );
                              setCableWizard(null);
                            }}
                            className={`w-full text-left px-2 py-1.5 text-[10px] font-mono rounded flex items-center justify-between mb-0.5 border transition-colors ${
                              busy || !match
                                ? "text-slate-600 border border-transparent cursor-not-allowed"
                                : "text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:border-cyan-500/40 border border-transparent"
                            }`}
                          >
                            <span className="truncate pr-2">{port.name}</span>
                            <span className="flex items-center gap-1">
                              {busy ? (
                                <span className="text-[8px] text-slate-600">terpakai</span>
                              ) : !match ? (
                                <span className="text-[8px] text-slate-600">{port.type ?? 'copper'} ≠ kabel</span>
                              ) : null}
                              <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${port.status === 'up' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </WizardPopover>
              )}
            </div>
          );
        })}
      </div>

      {/* Konfirmasi tipe kabel — drop port langsung diblokir sampai tipe dipilih (dropdown) */}
      {cableDraft && (() => {
        const srcNode = nodes.find((n) => n.id === cableDraft.srcNodeId);
        const tgtNode = nodes.find((n) => n.id === cableDraft.tgtNodeId);
        const tgtPort = tgtNode?.ports.find((p) => p.id === cableDraft.tgtPortId);
        const tgtBusy = tgtNode ? getPortConnection(tgtNode.id, cableDraft.tgtPortId) !== null : null;
        const match = cableMatchesPort(cableDraft.selected, tgtPort?.type);
        const isDefault = cableDraft.selected === cableDraft.inferred;
        return (
          <WizardPopover className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[80] w-60 bg-[#0F1015]/95 backdrop-blur-md border border-blue-500/30 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-2.5 py-2 border-b border-[#2B2D31] flex items-center justify-between bg-[#1A1D24]/80">
              <span className="text-[10px] font-semibold text-slate-200">Sambungkan Kabel</span>
              <button onClick={() => setCableDraft(null)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="p-2">
              <div className="text-[9.5px] font-mono text-slate-400 mb-1.5 truncate">
                {srcNode?.name}:{cableDraft.srcPortId} <span className="text-slate-600">↔</span> {tgtNode?.name}:{cableDraft.tgtPortId}
              </div>
              <label className="block text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                1. Tipe Kabel <span className="text-rose-400">*pilih dulu</span>
              </label>
              <select
                value={cableDraft.selected}
                onChange={(e) =>
                  setCableDraft({ ...cableDraft, selected: e.target.value as LabEdge['cableType'] })
                }
                className="w-full bg-[#1A1D24] border border-[#2B2D31] rounded-md text-[10px] px-1.5 py-1.5 text-slate-200 outline-none focus:border-blue-500/60 mb-1.5"
              >
                <option value="copper_straight">Straight (UTP)</option>
                <option value="copper_cross">Cross (UTP)</option>
                <option value="fiber">Fiber Optik</option>
                <option value="serial">Serial</option>
              </select>
              {isDefault && (
                <div className="mb-1.5 px-1.5 py-1 text-[8.5px] font-mono text-cyan-300/80 bg-cyan-500/10 rounded border border-cyan-500/20">
                  otomatis: {cableDraft.inferred === 'copper_straight' ? 'Straight (UTP)' : cableDraft.inferred === 'copper_cross' ? 'Cross (UTP)' : cableDraft.inferred === 'fiber' ? 'Fiber Optik' : 'Serial'}
                </div>
              )}
              {tgtBusy && (
                <div className="mb-1.5 px-1.5 py-1 text-[8.5px] font-mono text-rose-300/80 bg-rose-500/10 rounded border border-rose-500/20">
                  Port tujuan terpakai — tidak bisa disambung
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={() => setCableDraft(null)}
                  className="flex-1 px-2 py-1.5 text-[10px] rounded-md border border-[#2B2D31] text-slate-300 hover:bg-slate-800 transition"
                >
                  Batal
                </button>
                <button
                  disabled={tgtBusy || !match}
                  onClick={() => {
                    onCableConnect(
                      { nodeId: cableDraft.srcNodeId, portId: cableDraft.srcPortId },
                      { nodeId: cableDraft.tgtNodeId, portId: cableDraft.tgtPortId },
                      cableDraft.selected
                    );
                    setCableDraft(null);
                  }}
                  className={`flex-1 px-2 py-1.5 text-[10px] rounded-md font-semibold transition ${
                    tgtBusy || !match
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  Sambungkan
                </button>
              </div>
            </div>
          </WizardPopover>
        );
      })()}

      {(selectionBox || selectionRect) && (
        <div
          className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-30"
          style={{
            left: Math.min((selectionBox || selectionRect)!.x1, (selectionBox || selectionRect)!.x2),
            top: Math.min((selectionBox || selectionRect)!.y1, (selectionBox || selectionRect)!.y2),
            width: Math.abs((selectionBox || selectionRect)!.x2 - (selectionBox || selectionRect)!.x1),
            height: Math.abs((selectionBox || selectionRect)!.y2 - (selectionBox || selectionRect)!.y1),
          }}
        />
      )}

      {}
      {/* Desktop controls (disembunyikan di mobile — pakai floating action bar) */}
      {!isMobile && (
        <div className="absolute right-4 bottom-6 z-30 flex flex-col space-y-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-xl backdrop-blur-md">
          <button
            onClick={() => onToggleViewPorts?.()}
            title={viewPorts ? 'Sembunyikan panel port' : 'Lihat port & kabel terhubung'}
            className={`p-2 rounded transition ${
              viewPorts
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {viewPorts ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() =>
              onViewportChange({
                ...viewport,
                zoom: Math.min(viewport.zoom + 0.15, 3.0),
              })
            }
            title="Zoom In"
            className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              onViewportChange({
                ...viewport,
                zoom: Math.max(viewport.zoom - 0.15, 0.25),
              })
            }
            title="Zoom Out"
            className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => onViewportChange({ x: 0, y: 0, zoom: 1.0 })}
            title="Reset Zoom & Pan"
            className="p-2 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleLock}
            title={locked ? 'Kanvas terkunci — klik untuk buka' : 'Kunci kanvas (cegah geseran tak sengaja)'}
            className={`p-2 rounded transition ${
              locked
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {locked ? <LockFilled /> : <LockOpen />}
          </button>
        </div>
      )}

      {/* Mobile Floating Action Bar — tombol kunci kanvas ringkas
          (zoom in/out/reset sudah ada di MobileToolbar bawah) */}
      {isMobile && (
        <button
          onClick={onToggleLock}
          aria-label={locked ? 'Buka kunci kanvas' : 'Kunci kanvas'}
          title={locked ? 'Kanvas terkunci' : 'Kunci kanvas'}
          className={`absolute right-3 top-3 z-30 w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900/90 border shadow-xl backdrop-blur-md transition ${
            locked
              ? 'border-amber-500/50 text-amber-300'
              : 'border-slate-700/80 text-slate-200'
          }`}
        >
          {locked ? <LockFilled /> : <LockOpen />}
        </button>
      )}
    </div>
  );
};

