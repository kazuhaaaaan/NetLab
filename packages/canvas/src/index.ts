import { Point, ViewportState } from '../../shared/src/index';

export interface CanvasNode {
  id: string;
  name: string;
  vendor: string;
  model: string;
  position: Point;
  selected?: boolean;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: 'copper_straight' | 'copper_cross' | 'fiber' | 'serial';
}

export class CanvasRenderer {
  renderViewport(ctx: CanvasRenderingContext2D, viewport: ViewportState): void {
    ctx.save();
    ctx.translate(viewport.pan.x, viewport.pan.y);
    ctx.scale(viewport.zoom, viewport.zoom);
    // Grid rendering logic
    ctx.restore();
  }
}
