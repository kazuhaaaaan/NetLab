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
} from "lucide-react";

export interface Point {
  x: number;
  y: number;
}

export interface Port {
  id: string;
  name: string;
  type: string;
  status: "up" | "down";
  ipAddress?: string;
}

export interface LabNode {
  id: string;
  name: string;
  deviceType: "router" | "switch" | "firewall" | "server" | "pc";
  vendor: string;
  model: string;
  position: Point;
  selected?: boolean;
  ports: Port[];
}

export interface LabEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: "straight" | "cross" | "fiber" | "copper_cross";
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
  const side = idx % 2 === 0 ? "left" : "right";
  const slot = Math.floor(idx / 2);
  return {
    x: node.position.x + (side === "left" ? 0 : NODE_W),
    y: node.position.y + PORT_TOP + slot * PORT_GAP,
  };
}

import { GestureType, GestureDetail, InteractionEngine } from "../engine/InteractionEngine";

interface CanvasProps {
  nodes: LabNode[];
  edges: LabEdge[];
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onNodePositionChange: (nodeId: string, pos: { x: number; y: number }) => void;
  onOpenTerminal: (nodeId: string) => void;
  onPortClick: (nodeId: string, portId: string) => void;
  onCableConnect: (
    source: { nodeId: string; portId: string },
    target: { nodeId: string; portId?: string }
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
  viewPorts?: boolean;
  onToggleViewPorts?: () => void;
}

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
  viewPorts = false,
  onToggleViewPorts,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleGestureRef = useRef<(gesture: GestureDetail) => void>(() => {});
  const [connectingNode, setConnectingNode] = useState<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
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
        (n) => n.selected || n.id === selectedNodeId,
      );
      const isTargetSelected =
        targetNode && (targetNode.selected || targetNode.id === selectedNodeId);

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
        if (activeTool === 'cable') {
          setConnectingNode(gesture.nodeId);
        } else {
          onSelectNode(gesture.nodeId);
          onSelectEdge(null);
        }
      } else if (gesture.targetType === "edge" && gesture.targetId) {
        onSelectEdge(gesture.targetId);
        onSelectNode(null);
      } else if (gesture.targetType === "canvas") {
        onSelectNode(null);
        onSelectEdge(null);
      }
    } else if (gesture.type === "DOUBLE_TAP") {
      if (gesture.targetType === "node" && gesture.nodeId) {
        onOpenTerminal(gesture.nodeId);
      }
    } else if (gesture.type === "LONG_PRESS") {
      if (gesture.targetType === "node" && gesture.nodeId) {
        onSelectNode(gesture.nodeId);
      }
    } else if (gesture.type === "CABLE_DRAG") {
      if (gesture.nodeId && gesture.portId) {
        const sourceNode = nodes.find((n) => n.id === gesture.nodeId);
        if (sourceNode) {
          const from = getPortAnchor(sourceNode, gesture.portId);
          setCableDrag({
            x1: from.x,
            y1: from.y,
            x2: (gesture.point.x - viewport.x) / viewport.zoom,
            y2: (gesture.point.y - viewport.y) / viewport.zoom,
          });
        }
      }
      setCableHover(gesture.hover || null);
    } else if (gesture.type === "CABLE_CONNECT") {
      setCableDrag(null);
      setCableHover(null);
      if (gesture.nodeId && gesture.portId && gesture.targetNodeId) {
        onCableConnect(
          { nodeId: gesture.nodeId, portId: gesture.portId },
          { nodeId: gesture.targetNodeId, portId: gesture.targetPortId }
        );
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
        onContextMenu(e);
      }}
      onClick={() => setConnectingNode(null)}
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
          const { x: x1, y: y1 } = getPortAnchor(sourceNode, edge.sourcePortId);
          const { x: x2, y: y2 } = getPortAnchor(targetNode, edge.targetPortId);
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
          const isHoverConnected =
            hoverNodeId !== null &&
            (edge.sourceNodeId === hoverNodeId || edge.targetNodeId === hoverNodeId);
          const isWireless =
            sourceNode.deviceType === 'wireless' ||
            targetNode.deviceType === 'wireless';

          if (isWireless) {
            // Draw animated dashed Bezier curve with Wifi icon at center
            const arcColor = isSelected ? '#ef4444' : '#22d3ee';
            // Calculate bezier midpoint (t = 0.5)
            const t = 0.5;
            const mt1 = 1 - t;
            const mx = Math.pow(mt1, 3) * x1 + 3 * Math.pow(mt1, 2) * t * cx1 + 3 * mt1 * Math.pow(t, 2) * cx2 + Math.pow(t, 3) * x2;
            const my = Math.pow(mt1, 3) * y1 + 3 * Math.pow(mt1, 2) * t * cy1 + 3 * mt1 * Math.pow(t, 2) * cy2 + Math.pow(t, 3) * y2;

            return (
              <g key={edge.id} data-edge-id={edge.id} className="cursor-pointer pointer-events-auto"
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
                  strokeWidth={isSelected ? "4" : isHoverConnected ? "4" : "2.5"}
                  strokeDasharray="8 8"
                  className="transition-all"
                  style={isHoverConnected ? { filter: "drop-shadow(0 0 5px rgba(34,211,238,0.8))" } : undefined}
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

                {/* endpoint dots */}
                <circle cx={x1} cy={y1} r="4" fill={arcColor} />
                <circle cx={x2} cy={y2} r="4" fill={arcColor} />
              </g>
            );
          }

          return (
            <g key={edge.id} data-edge-id={edge.id} className="cursor-pointer pointer-events-auto"
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
                stroke={
                  isSelected 
                    ? "#ef4444" 
                    : edge.cableType === "fiber"
                      ? "#f97316"
                      : edge.cableType === "serial"
                        ? "#f43f5e"
                        : edge.cableType === "copper_cross"
                          ? "#eab308"
                          : "#3b82f6"
                }
                strokeWidth={isSelected ? "5" : isHoverConnected ? "4.5" : "3"}
                strokeDasharray={
                  edge.cableType === "copper_cross" ? "6,6" : edge.cableType === "serial" ? "2,4" : "none"
                }
                className="transition-all hover:stroke-[4px]"
                style={isHoverConnected && !isSelected ? { filter: "drop-shadow(0 0 5px currentColor)" } : undefined}
              />
              <path
                data-edge-id={edge.id}
                d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
              />
              <circle cx={x1} cy={y1} r="4" fill={isSelected ? "#ef4444" : "#3b82f6"} />
              <circle cx={x2} cy={y2} r="4" fill={isSelected ? "#ef4444" : "#3b82f6"} />
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

        {/* Delete-cable chip on the selected edge */}
        {(() => {
          const edge = edges.find((e) => e.id === selectedEdgeId);
          if (!edge) return null;
          const sNode = nodes.find((n) => n.id === edge.sourceNodeId);
          const tNode = nodes.find((n) => n.id === edge.targetNodeId);
          if (!sNode || !tNode) return null;
          const { x: x1, y: y1 } = getPortAnchor(sNode, edge.sourcePortId);
          const { x: x2, y: y2 } = getPortAnchor(tNode, edge.targetPortId);
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
          return (
            <g pointerEvents="none">
              <foreignObject x={mx - 18} y={my - 18} width={36} height={36}>
                <div className="flex items-center justify-center w-full h-full">
                  <button
                    data-delete-edge-id={edge.id}
                    title="Delete Cable"
                    className="pointer-events-auto p-1.5 rounded-full bg-rose-600/90 border border-rose-400 text-white shadow-lg hover:bg-rose-500 transition-all animate-in fade-in zoom-in-90 duration-150"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </foreignObject>
            </g>
          );
        })()}
      </svg>

      {/* Node Layer */}
      <div
        className="absolute inset-0 pointer-events-auto z-20"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id || node.selected;
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
              }}
              className={`absolute flex flex-col items-center justify-center p-2 rounded-lg group transition-all ${
                activeTool === 'cable' ? 'cursor-pointer hover:bg-white/[0.05]' : 'cursor-grab active:cursor-grabbing'
              } ${
                cableStart?.nodeId === node.id
                  ? "bg-blue-500/10 border border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  : isSelected
                    ? "bg-white/[0.03] border border-white/10"
                    : "hover:bg-white/[0.02] border border-transparent"
              }`}
            >
              <div className="pointer-events-none flex items-center justify-center w-12 h-12 bg-[#1A1D24] border border-[#2B2D31] rounded-lg shadow-sm mb-2 group-hover:border-[#4B4D51] transition-colors relative">
                {getNodeIcon(node.deviceType)}
                {/* Status indicator tipis */}
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 border border-[#1A1D24]"></span>
              </div>
              <div className="text-center pointer-events-none flex flex-col items-center">
                <span className="text-[11px] font-medium text-slate-200 tracking-tight leading-tight max-w-[88px] truncate">{node.name}</span>
                <span className="text-[9px] text-slate-500 font-mono mt-0.5 max-w-[88px] truncate">{node.model}</span>
              </div>

              {/* Port dots - drag between ports to connect cables */}
              {node.ports.map((port, idx) => {
                const side = idx % 2 === 0 ? "left" : "right";
                const slot = Math.floor(idx / 2);
                const isCableStart = cableStart?.nodeId === node.id && cableStart?.portId === port.id;
                const isHover = cableHover?.nodeId === node.id && cableHover?.portId === port.id;
                const portConn = getPortConnection(node.id, port.id);
                return (
                  <div
                    key={port.id}
                    data-node-id={node.id}
                    data-port-id={port.id}
                    title={`${port.name} (${port.status})${portConn ? ` → ${portConn}` : ' — kosong'}`}
                    className={`absolute w-4 h-4 flex items-center justify-center z-40 cursor-crosshair touch-none ${
                      side === "left" ? "-left-2" : "-right-2"
                    } ${cableDrag ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity ${
                      isCableStart || isHover ? "opacity-100" : ""
                    }`}
                    style={{ top: `${PORT_TOP + slot * PORT_GAP - 8}px` }}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full border transition-all ${
                        port.status === "up"
                          ? "bg-emerald-500 border-emerald-300/70"
                          : "bg-slate-600 border-slate-500"
                      } ${isCableStart ? "ring-2 ring-blue-400 scale-125" : ""} ${
                        isHover ? "ring-2 ring-cyan-300 scale-125" : ""
                      } ${cableDrag ? "hover:ring-2 hover:ring-cyan-300 hover:scale-125" : ""}`}
                    />
                  </div>
                );
              })}
              
              {/* Open CLI button that appears on hover/select — CLI always follows the selected device */}
              <button
                className={`absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 bg-[#1A1D24] border border-[#2B2D31] rounded-md text-slate-400 hover:text-white hover:border-emerald-500 transition-opacity z-30 ${
                  isSelected ? "opacity-100 pointer-events-auto shadow-md" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTerminal(node.id);
                }}
                title="Open CLI"
              >
                <TerminalSquare className="w-3 h-3" />
              </button>

              {/* Connect Cable button that appears on hover/select (Hidden if cable tool active) */}
              {activeTool !== 'cable' && (
                <button 
                  className={`absolute -right-8 top-1/2 -translate-y-1/2 p-1.5 bg-[#1A1D24] border border-[#2B2D31] rounded-md text-slate-400 hover:text-white hover:border-blue-500 transition-opacity z-30 ${
                    isSelected ? "opacity-100 pointer-events-auto shadow-md" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConnectingNode(connectingNode === node.id ? null : node.id);
                  }}
                  title="Connect Cable"
                >
                  <Plus className="w-3 h-3" />
                </button>
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
                          <span className={`truncate text-right ${conn ? 'text-cyan-300' : 'text-slate-600'}`}>
                            {conn ? `→ ${conn}` : port.ipAddress || 'kosong'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-2.5 py-1 text-[9px] font-mono text-slate-600 border-t border-[#2B2D31] bg-[#1A1D24]/60">
                    panah = kabel terhubung · warna cyan = port terpakai
                  </div>
                </div>
              ) : null}

              {/* Port Popover */}
              {connectingNode === node.id && (                <div 
                  className="absolute left-[calc(100%+12px)] top-0 z-50 w-36 bg-[#0F1015]/95 backdrop-blur-md border border-[#2B2D31] rounded-lg shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2.5 py-2 border-b border-[#2B2D31] flex items-center justify-between bg-[#1A1D24]/80">
                    <span className="text-[10px] font-semibold text-slate-300">Select Port</span>
                    <button onClick={() => setConnectingNode(null)} className="text-slate-500 hover:text-white transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="p-1 max-h-40 overflow-y-auto">
                    {node.ports.length === 0 && (
                      <div className="px-2 py-2 text-[9px] text-slate-500 text-center">No ports available</div>
                    )}
                    {node.ports.map((port) => {
                      const isCableStart = cableStart?.nodeId === node.id && cableStart?.portId === port.id;
                      return (
                        <button
                          key={port.id}
                          onClick={() => {
                            onPortClick(node.id, port.id);
                            setConnectingNode(null);
                          }}
                          className={`w-full text-left px-2 py-1.5 text-[10px] font-mono rounded flex items-center justify-between mb-0.5 transition-colors ${
                            isCableStart 
                              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                              : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent"
                          }`}
                        >
                          <span className="truncate pr-2">{port.name}</span>
                          <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${port.status === 'up' ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectionBox && (
        <div
          className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-30"
          style={{
            left: Math.min(selectionBox.x1, selectionBox.x2),
            top: Math.min(selectionBox.y1, selectionBox.y2),
            width: Math.abs(selectionBox.x2 - selectionBox.x1),
            height: Math.abs(selectionBox.y2 - selectionBox.y1),
          }}
        />
      )}

      {}
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
      </div>
    </div>
  );
};

