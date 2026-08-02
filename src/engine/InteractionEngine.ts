import { Point } from "../types";

export type GestureType =
  | "TAP"
  | "DOUBLE_TAP"
  | "LONG_PRESS"
  | "PINCH"
  | "PAN"
  | "CABLE_CONNECT"
  | "CABLE_DRAG"
  | "CABLE_CANCEL"
  | "SELECTION_BOX"
  | "NODE_DRAG";

export interface GestureDetail {
  type: GestureType;
  point: Point;
  targetId?: string;
  targetType?: "node" | "port" | "edge" | "canvas";
  nodeId?: string;
  portId?: string;
  /** cable drag: the drop target under the cursor */
  targetNodeId?: string;
  targetPortId?: string;
  hover?: { nodeId: string; portId: string } | null;
  /** set when tapping the delete-cable chip on a selected edge */
  deleteEdgeId?: string;
  scaleDelta?: number;
  panDelta?: Point;
  dragDelta?: Point;
  selectionRect?: { x1: number; y1: number; x2: number; y2: number };
}

export class InteractionEngine {
  private element: HTMLElement;
  private activePointers: Map<number, { x: number; y: number; time: number }> =
    new Map();
  private lastTapTime = 0;
  private lastTapPoint: Point = { x: 0, y: 0 };
  private longPressTimer: number | null = null;
  private isLongPressTriggered = false;
  private initialPinchDistance: number | null = null;
  private lastPanPoint: Point | null = null;
  private selectionStart: Point | null = null;
  private onGestureCallback: (detail: GestureDetail) => void;

  // Node drag tracking state
  private draggedNodeId: string | null = null;
  private isDraggingNode = false;
  private dragStartPoint: Point | null = null;
  // Cable drag tracking state (port-to-port connection)
  private cableDrag: { nodeId: string; portId: string; startPt: Point } | null =
    null;
  // Touch device detection for single-finger pan
  private isTouchPointer = false;
  private initialTargetInfo: ReturnType<InteractionEngine["getTargetInfo"]> | null = null;

  constructor(
    element: HTMLElement,
    onGesture: (detail: GestureDetail) => void,
  ) {
    this.element = element;
    this.onGestureCallback = onGesture;
    this.attachEvents();
  }

  private attachEvents(): void {
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerCancel);
    this.element.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });
  }

  public destroy(): void {
    this.clearLongPressTimer();
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerUp);
    this.element.removeEventListener("pointercancel", this.handlePointerCancel);
    this.element.removeEventListener("wheel", this.handleWheel);
  }

  private getCanvasPoint(e: PointerEvent): Point {
    const rect = this.element.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private getTargetInfo(e: PointerEvent): {
    targetId?: string;
    targetType?: "node" | "port" | "edge" | "canvas";
    nodeId?: string;
    portId?: string;
    deleteEdgeId?: string;
  } {
    let target = e.target as HTMLElement | null;
    while (target && target !== this.element) {
      if (target.dataset.deleteEdgeId) {
        return {
          targetId: target.dataset.deleteEdgeId,
          targetType: "canvas",
          deleteEdgeId: target.dataset.deleteEdgeId,
        };
      }
      if (target.dataset.portId && target.dataset.nodeId) {
        return {
          targetId: target.dataset.portId,
          targetType: "port",
          nodeId: target.dataset.nodeId,
          portId: target.dataset.portId,
        };
      }
      if (target.dataset.nodeId) {
        return {
          targetId: target.dataset.nodeId,
          targetType: "node",
          nodeId: target.dataset.nodeId,
        };
      }
      if (target.dataset.edgeId) {
        return {
          targetId: target.dataset.edgeId,
          targetType: "edge",
        };
      }
      target = target.parentElement;
    }
    return { targetType: "canvas" };
  }

  private handlePointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.element.setPointerCapture) {
      try {
        this.element.setPointerCapture(e.pointerId);
      } catch {
        // Fallback for non-standard pointer contexts
      }
    }
    const pt = this.getCanvasPoint(e);
    this.isTouchPointer = e.pointerType === 'touch' || e.pointerType === 'pen';
    this.activePointers.set(e.pointerId, {
      x: pt.x,
      y: pt.y,
      time: Date.now(),
    });
    const targetInfo = this.getTargetInfo(e);

    // Port press → start cable drag (drag from a port to another port/node)
    if (
      targetInfo.targetType === "port" &&
      targetInfo.nodeId &&
      targetInfo.portId &&
      e.button === 0
    ) {
      this.clearLongPressTimer();
      this.cableDrag = {
        nodeId: targetInfo.nodeId,
        portId: targetInfo.portId,
        startPt: pt,
      };
      return;
    }

    // Multi-touch gestures (Pinch / Two-finger Pan)
    if (this.activePointers.size === 2) {
      this.clearLongPressTimer();
      this.draggedNodeId = null;
      this.isDraggingNode = false;
      if (this.cableDrag) {
        this.cableDrag = null;
        this.onGestureCallback({ type: "CABLE_CANCEL", point: pt });
      }
      const pts = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(
        pts[0].x - pts[1].x,
        pts[0].y - pts[1].y,
      );
      this.lastPanPoint = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }

    if (this.activePointers.size === 1) {
      this.isLongPressTriggered = false;
      this.lastPanPoint = pt;
      this.dragStartPoint = pt;
      this.initialTargetInfo = targetInfo;

      // Identify node interaction on primary click or touch (excluding ports)
      if (
        targetInfo.targetType === "node" &&
        targetInfo.nodeId &&
        e.button === 0
      ) {
        this.draggedNodeId = targetInfo.nodeId;
        this.isDraggingNode = false;
      } else {
        this.draggedNodeId = null;
        this.isDraggingNode = false;
      }

      // Long press timer initialization (500ms)
      this.longPressTimer = window.setTimeout(() => {
        if (!this.isDraggingNode) {
          this.isLongPressTriggered = true;
          this.onGestureCallback({
            type: "LONG_PRESS",
            point: pt,
            ...targetInfo,
          });
        }
      }, 500);

      // Start selection box if clicking on empty canvas with shift key
      if (targetInfo.targetType === "canvas" && e.buttons === 1 && e.shiftKey) {
        this.selectionStart = pt;
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;
    const pt = this.getCanvasPoint(e);
    this.activePointers.set(e.pointerId, {
      x: pt.x,
      y: pt.y,
      time: Date.now(),
    });

    // Cancel long press if pointer moves beyond threshold (>5px)
    if (
      this.dragStartPoint &&
      Math.hypot(pt.x - this.dragStartPoint.x, pt.y - this.dragStartPoint.y) > 5
    ) {
      this.clearLongPressTimer();
    }

    // Cable dragging: emit rubber-band updates + hover target detection
    if (this.cableDrag) {
      const dist = Math.hypot(
        pt.x - this.cableDrag.startPt.x,
        pt.y - this.cableDrag.startPt.y
      );
      if (dist > 4) {
        const hover = this.getElementInfoAt(e.clientX, e.clientY);
        this.onGestureCallback({
          type: "CABLE_DRAG",
          point: pt,
          nodeId: this.cableDrag.nodeId,
          portId: this.cableDrag.portId,
          hover: hover?.portId ? { nodeId: hover.nodeId!, portId: hover.portId } : null,
        });
      }
      return;
    }

    // Two-finger gesture processing (Pinch or Pan)
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const currentCenter = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      if (
        this.initialPinchDistance &&
        Math.abs(currentDist - this.initialPinchDistance) > 10
      ) {
        const scaleDelta = currentDist / this.initialPinchDistance;
        this.initialPinchDistance = currentDist;
        this.onGestureCallback({
          type: "PINCH",
          point: currentCenter,
          scaleDelta,
        });
      }
      if (this.lastPanPoint) {
        const panDelta = {
          x: currentCenter.x - this.lastPanPoint.x,
          y: currentCenter.y - this.lastPanPoint.y,
        };
        this.onGestureCallback({
          type: "PAN",
          point: currentCenter,
          panDelta,
        });
        this.lastPanPoint = currentCenter;
      }
      return;
    }

    // Single pointer gestures (Node Drag / Canvas Pan / Selection Box)
    if (this.activePointers.size === 1 && !this.isLongPressTriggered) {
      // 1. NODE DRAGGING MODE
      if (this.draggedNodeId && this.lastPanPoint) {
        const dist = Math.hypot(
          pt.x - (this.dragStartPoint?.x ?? pt.x),
          pt.y - (this.dragStartPoint?.y ?? pt.y),
        );
        if (dist > 3 || this.isDraggingNode) {
          this.isDraggingNode = true;
          this.clearLongPressTimer();

          const dragDelta = {
            x: pt.x - this.lastPanPoint.x,
            y: pt.y - this.lastPanPoint.y,
          };

          this.onGestureCallback({
            type: "NODE_DRAG",
            point: pt,
            targetId: this.draggedNodeId,
            targetType: "node",
            nodeId: this.draggedNodeId,
            dragDelta,
          });

          this.lastPanPoint = pt;
          return;
        }
      }

      // 2. CANVAS PAN
      // Desktop: middle mouse (button 4) or left click on empty canvas with pan tool
      // Mobile/Touch: single finger drag on canvas (no node dragging)
      const isInitialCanvas = this.initialTargetInfo?.targetType === 'canvas';
      const isMobilePan = this.isTouchPointer && isInitialCanvas && !this.draggedNodeId;
      if (
        e.buttons === 4 ||
        isMobilePan ||
        (e.buttons === 1 &&
          isInitialCanvas &&
          !this.selectionStart &&
          !this.draggedNodeId)
      ) {
        if (this.lastPanPoint) {
          const panDelta = {
            x: pt.x - this.lastPanPoint.x,
            y: pt.y - this.lastPanPoint.y,
          };
          this.onGestureCallback({
            type: "PAN",
            point: pt,
            panDelta,
          });
        }
      }

      // 3. SELECTION BOX — only on non-touch (desktop), prevent conflicts with mobile pan
      if (this.selectionStart && !this.isTouchPointer) {
        this.onGestureCallback({
          type: "SELECTION_BOX",
          point: pt,
          selectionRect: {
            x1: Math.min(this.selectionStart.x, pt.x),
            y1: Math.min(this.selectionStart.y, pt.y),
            x2: Math.max(this.selectionStart.x, pt.x),
            y2: Math.max(this.selectionStart.y, pt.y),
          },
        });
      }

      this.lastPanPoint = pt;
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (
      this.element.hasPointerCapture &&
      this.element.hasPointerCapture(e.pointerId)
    ) {
      try {
        this.element.releasePointerCapture(e.pointerId);
      } catch {
        // Fallback for edge cases
      }
    }
    this.clearLongPressTimer();
    const pt = this.getCanvasPoint(e);
    const targetInfo = this.initialTargetInfo || this.getTargetInfo(e);
    const now = Date.now();

    const wasDragging = this.isDraggingNode;

    // Cable drag release: resolve drop target, emit connect or cancel.
    if (this.cableDrag) {
      const dist = Math.hypot(
        pt.x - this.cableDrag.startPt.x,
        pt.y - this.cableDrag.startPt.y
      );
      if (dist > 4) {
        const info = this.getElementInfoAt(e.clientX, e.clientY);
        if (info?.nodeId) {
          this.onGestureCallback({
            type: "CABLE_CONNECT",
            point: pt,
            nodeId: this.cableDrag.nodeId,
            portId: this.cableDrag.portId,
            targetNodeId: info.nodeId,
            targetPortId: info.portId,
          });
        } else {
          this.onGestureCallback({ type: "CABLE_CANCEL", point: pt });
        }
      } else {
        // No movement → plain port tap (tap-to-connect flow)
        this.onGestureCallback({
          type: "TAP",
          point: pt,
          targetType: "port",
          nodeId: this.cableDrag.nodeId,
          portId: this.cableDrag.portId,
        });
      }
      this.cableDrag = null;
      this.initialTargetInfo = null;
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) {
        this.initialPinchDistance = null;
        this.lastPanPoint = null;
      }
      return;
    }

    if (!this.isLongPressTriggered && this.activePointers.size === 1) {
      if (!wasDragging) {
        // Double Tap detection (<300ms between taps within 20px)
        if (
          now - this.lastTapTime < 300 &&
          Math.hypot(pt.x - this.lastTapPoint.x, pt.y - this.lastTapPoint.y) <
            20
        ) {
          this.onGestureCallback({
            type: "DOUBLE_TAP",
            point: pt,
            ...targetInfo,
          });
          this.lastTapTime = 0;
        } else {
          this.onGestureCallback({
            type: "TAP",
            point: pt,
            ...targetInfo,
          });
          this.lastTapTime = now;
          this.lastTapPoint = pt;
        }
      }
    }

    this.draggedNodeId = null;
    this.isDraggingNode = false;
    this.dragStartPoint = null;
    this.selectionStart = null;
    this.initialTargetInfo = null;
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0) {
      this.initialPinchDistance = null;
      this.lastPanPoint = null;
    }
  };

  private handlePointerCancel = (e: PointerEvent): void => {
    if (
      this.element.hasPointerCapture &&
      this.element.hasPointerCapture(e.pointerId)
    ) {
      try {
        this.element.releasePointerCapture(e.pointerId);
      } catch {
        // Fallback for edge cases
      }
    }
    this.clearLongPressTimer();
    if (this.cableDrag) {
      this.cableDrag = null;
      this.onGestureCallback({ type: "CABLE_CANCEL", point: this.lastPanPoint || { x: 0, y: 0 } });
    }
    this.draggedNodeId = null;
    this.isDraggingNode = false;
    this.dragStartPoint = null;
    this.selectionStart = null;
    this.initialTargetInfo = null;
    this.activePointers.delete(e.pointerId);
  };

  /**
   * Geometric hit-test at a client position (works even while the pointer
   * is captured by the container). Used for cable drag hover/drop targets.
   */
  private getElementInfoAt(
    clientX: number,
    clientY: number
  ): { nodeId?: string; portId?: string } | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;
    let target: HTMLElement | null = el;
    while (target && target !== this.element) {
      if (target.dataset?.nodeId && target.dataset?.portId) {
        return {
          nodeId: target.dataset.nodeId,
          portId: target.dataset.portId,
        };
      }
      if (target.dataset?.nodeId) {
        return { nodeId: target.dataset.nodeId };
      }
      target = target.parentElement;
    }
    return null;
  }

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const pt = { x: e.clientX, y: e.clientY };
    if (e.ctrlKey) {
      // Trackpad pinch (browser mengirim wheel + ctrlKey): zoom proporsional
      // dengan besaran cubitan — deltaY negatif (jari menjauh) = zoom in.
      const scaleDelta = Math.exp(-e.deltaY * 0.005);
      this.onGestureCallback({ type: "PINCH", point: pt, scaleDelta });
      return;
    }
    const scaleDelta = e.deltaY < 0 ? 1.1 : 0.9;
    this.onGestureCallback({ type: "PINCH", point: pt, scaleDelta });
  };

  private clearLongPressTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
