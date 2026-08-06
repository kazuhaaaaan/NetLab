export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ViewportState {
  pan: Point;
  zoom: number;
}

export type PointerGestureType = 
  | 'TAP' 
  | 'DOUBLE_TAP' 
  | 'LONG_PRESS' 
  | 'PINCH' 
  | 'PAN' 
  | 'CABLE_CONNECT' 
  | 'SELECT_BOX';

export interface GestureEvent {
  type: PointerGestureType;
  point: Point;
  secondaryPoint?: Point;
  scaleDelta?: number;
  panDelta?: Point;
  targetId?: string;
  targetType?: 'node' | 'port' | 'edge' | 'canvas';
}
