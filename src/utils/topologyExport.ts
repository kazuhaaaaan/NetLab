import { LabProject, LabNode } from '../types';

// ============================================================
// Topologi → file SVG / PNG (ekspor gambar, tanpa canvas DOM)
// ============================================================

const NODE_W = 96;
const NODE_H = 88;
const PORT_TOP = 20;
const PORT_GAP = 18;

interface Anchor {
  x: number;
  y: number;
}

function portAnchor(node: LabNode, portId: string): Anchor {
  const idx = node.ports.findIndex((p) => p.id === portId);
  if (idx < 0) return { x: node.position.x + NODE_W / 2, y: node.position.y + NODE_H / 2 };
  const side = idx % 2 === 0 ? 'left' : 'right';
  const slot = Math.floor(idx / 2);
  return {
    x: node.position.x + (side === 'left' ? 0 : NODE_W),
    y: node.position.y + PORT_TOP + slot * PORT_GAP,
  };
}

/** Cable endpoint clamped inside the device body (matches the canvas look). */
function edgeAnchor(node: LabNode, portId: string): Anchor {
  const a = portAnchor(node, portId);
  const inset = 6;
  return {
    x: Math.min(Math.max(a.x, node.position.x + inset), node.position.x + NODE_W - inset),
    y: Math.min(Math.max(a.y, node.position.y + inset), node.position.y + NODE_H - inset),
  };
}

function edgePath(
  nodeA: LabNode,
  portA: string,
  nodeB: LabNode,
  portB: string,
  tx: (v: number) => number,
  ty: (v: number) => number
): string {
  const a = edgeAnchor(nodeA, portA);
  const b = edgeAnchor(nodeB, portB);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let cx1: number, cy1: number, cx2: number, cy2: number;
  if (Math.abs(dy) > Math.abs(dx)) {
    const bulge = Math.max(50, Math.abs(dy) * 0.3);
    cx1 = a.x + bulge;
    cy1 = a.y + dy * 0.25;
    cx2 = b.x + bulge;
    cy2 = b.y - dy * 0.25;
  } else {
    cx1 = a.x + dx * 0.5;
    cy1 = a.y;
    cx2 = a.x + dx * 0.5;
    cy2 = b.y;
  }
  return `M ${tx(a.x)} ${ty(a.y)} C ${tx(cx1)} ${ty(cy1)}, ${tx(cx2)} ${ty(cy2)}, ${tx(b.x)} ${ty(b.y)}`;
}

function cableColor(cableType: string): string {
  if (cableType === 'fiber') return '#f97316';
  if (cableType === 'serial') return '#f43f5e';
  if (cableType === 'copper_cross') return '#eab308';
  return '#3b82f6';
}

function deviceGlyph(deviceType: string): string {
  switch (deviceType) {
    case 'switch':
      return '<rect x="-13" y="-7" width="26" height="14" rx="2" fill="#3b82f6"/>';
    case 'firewall':
      return '<path d="M0 -10 L8 -5 L8 4 Q0 9 -8 4 L-8 -5 Z" fill="#f43f5e"/>';
    case 'pc':
      return '<rect x="-10" y="-8" width="20" height="14" rx="2" fill="#10b981"/><rect x="-6" y="7" width="12" height="2" fill="#10b981"/>';
    case 'server':
      return '<rect x="-10" y="-9" width="20" height="6" rx="1" fill="#a855f7"/><rect x="-10" y="-2" width="20" height="6" rx="1" fill="#a855f7"/><rect x="-10" y="5" width="20" height="6" rx="1" fill="#a855f7"/>';
    case 'wireless':
      return '<path d="M-9 -3 Q0 -12 9 -3" fill="none" stroke="#22d3ee" stroke-width="2"/><path d="M-5 3 Q0 -3 5 3" fill="none" stroke="#22d3ee" stroke-width="2"/><circle cx="0" cy="7" r="1.5" fill="#22d3ee"/>';
    case 'router':
    default:
      return '<circle cx="0" cy="0" r="9" fill="#38bdf8"/>';
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildSvg(project: LabProject, theme: 'dark' | 'light'): string {
  const nodes = project.nodes;
  const edges = project.edges;
  const W = 1600;
  const H = 1000;
  const PAD = 80;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = W;
    maxY = H;
  }

  const contentW = maxX - minX + PAD * 2;
  const contentH = maxY - minY + PAD * 2;
  const scale = Math.min(1, Math.min(W / contentW, H / contentH));
  const offX = (W - contentW * scale) / 2 - minX * scale + PAD * scale;
  const offY = (H - contentH * scale) / 2 - minY * scale + PAD * scale;
  const tx = (v: number) => offX + v * scale;
  const ty = (v: number) => offY + v * scale;

  const bg = theme === 'dark' ? '#0B0C0E' : '#F4F5F8';
  const dot = theme === 'dark' ? '#22232B' : '#D1D5DB';
  const textPrimary = theme === 'dark' ? '#E2E8F0' : '#1E293B';
  const textSecondary = theme === 'dark' ? '#64748B' : '#94A3B8';
  const nodeBg = theme === 'dark' ? '#1A1D24' : '#FFFFFF';
  const nodeBorder = theme === 'dark' ? '#2B2D31' : '#CBD5E1';

  const dots: string[] = [];
  for (let gx = 0; gx < W; gx += 30) {
    for (let gy = 0; gy < H; gy += 30) {
      dots.push(`<circle cx="${gx}" cy="${gy}" r="1" fill="${dot}" opacity="0.5"/>`);
    }
  }

  const edgeEls = edges
    .map((e) => {
      const src = nodes.find((n) => n.id === e.sourceNodeId);
      const tgt = nodes.find((n) => n.id === e.targetNodeId);
      if (!src || !tgt) return '';
      const d = edgePath(src, e.sourcePortId, tgt, e.targetPortId, tx, ty);
      const col = cableColor(e.cableType);
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>`;
    })
    .join('');

  const nodeEls = nodes
    .map((n) => {
      const x = n.position.x;
      const y = n.position.y;
      const rx = tx(x);
      const ry = ty(y);
      const nx = tx(x + NODE_W / 2);
      const ny = ty(y + NODE_H / 2);
      return `
        <g>
          <rect x="${rx}" y="${ry}" width="${NODE_W * scale}" height="${NODE_H * scale}" rx="8" fill="${nodeBg}" stroke="${nodeBorder}" stroke-width="1"/>
          <g transform="translate(${nx} ${ny - 10 * scale}) scale(${scale})" opacity="0.95">${deviceGlyph(n.deviceType)}</g>
          <text x="${nx}" y="${ny + 8 * scale}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${11 * scale}" font-weight="600" fill="${textPrimary}">${escapeXml(n.name)}</text>
          <text x="${nx}" y="${ny + 21 * scale}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="${8.5 * scale}" fill="${textSecondary}">${escapeXml(n.model)}</text>
        </g>`;
    })
    .join('');

  const title = escapeXml(project.metadata.name || 'NetLab Topology');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${dots.join('')}
  <text x="${W / 2}" y="34" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" fill="${textPrimary}">${title}</text>
  <text x="${W / 2}" y="54" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="${textSecondary}">${nodes.length} devices · ${edges.length} cables · NetLab</text>
  ${edgeEls}
  ${nodeEls}
</svg>`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fileBaseName(project: LabProject): string {
  return (project.metadata.name || 'topology').toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'topology';
}

export function exportTopologySvg(project: LabProject, theme: 'dark' | 'light'): void {
  const svg = buildSvg(project, theme);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  download(blob, `${fileBaseName(project)}.svg`);
}

export function exportTopologyPng(project: LabProject, theme: 'dark' | 'light'): void {
  const svg = buildSvg(project, theme);
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = theme === 'dark' ? '#0B0C0E' : '#F4F5F8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${fileBaseName(project)}.png`);
    }, 'image/png');
  };
  img.src = encoded;
}
