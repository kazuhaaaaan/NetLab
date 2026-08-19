import type { NetworkSimulator } from '../../engine/net/core/NetworkSimulator';
import type { NodeMemory } from '../../../packages/vendors/src/common/types';
import type React from 'react';

export interface WinHostProps {
  nodeId: string;
  nodeName: string;
  sim: NetworkSimulator;
  getMem: () => NodeMemory;
  /** panggil setelah state Windows berubah: sync ke engine + persist memory. */
  onChanged: () => void;
}

export interface WinWindowDef {
  id: string;
  title: string;
  icon: React.ElementType;
  width: number;
  height: number;
  content: React.ReactNode;
}