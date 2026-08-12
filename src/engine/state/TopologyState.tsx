/**
 * TopologyState — store topologi facade (React Context + useReducer).
 *
 * Tidak pakai Zustand/Redux; deps hanya React. State berisi Map perangkat
 * (DeviceState) dan daftar kabel. Reducer diekspor agar bisa diuji murni.
 */

import React, { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { DeviceState } from './DeviceState';

/** Satu kabel: "deviceId:interface" → "deviceId:interface". */
export interface TopologyCable {
  from: string;
  to: string;
}

/** State store topologi. */
export interface TopologyState {
  devices: Map<string, DeviceState>;
  cables: TopologyCable[];
}

export type TopologyAction =
  | { type: 'DEVICE_ADDED'; device: DeviceState }
  | { type: 'DEVICE_UPDATED'; device: DeviceState }
  | { type: 'DEVICE_REMOVED'; deviceId: string }
  | { type: 'CABLE_ADDED'; cable: TopologyCable }
  | { type: 'CABLE_REMOVED'; from: string; to: string }
  | { type: 'STATES_RESTORED'; devices: DeviceState[]; cables: TopologyCable[] };

/** State awal kosong. */
export const INITIAL_TOPOLOGY_STATE: TopologyState = {
  devices: new Map(),
  cables: [],
};

/**
 * Reducer murni TopologyState — semua update immutabel (Map baru).
 */
export function topologyReducer(
  state: TopologyState,
  action: TopologyAction
): TopologyState {
  switch (action.type) {
    case 'DEVICE_ADDED':
    case 'DEVICE_UPDATED': {
      const devices = new Map(state.devices);
      devices.set(action.device.id, action.device);
      return { ...state, devices };
    }
    case 'DEVICE_REMOVED': {
      const devices = new Map(state.devices);
      devices.delete(action.deviceId);
      return {
        ...state,
        devices,
        cables: state.cables.filter(
          (c) => !c.from.startsWith(action.deviceId + ':') && !c.to.startsWith(action.deviceId + ':')
        ),
      };
    }
    case 'CABLE_ADDED': {
      const exists = state.cables.some(
        (c) =>
          (c.from === action.cable.from && c.to === action.cable.to) ||
          (c.from === action.cable.to && c.to === action.cable.from)
      );
      if (exists) return state;
      return { ...state, cables: [...state.cables, action.cable] };
    }
    case 'CABLE_REMOVED':
      return {
        ...state,
        cables: state.cables.filter(
          (c) =>
            !(
              (c.from === action.from && c.to === action.to) ||
              (c.from === action.to && c.to === action.from)
            )
        ),
      };
    case 'STATES_RESTORED':
      return { devices: new Map(action.devices.map((d) => [d.id, d])), cables: action.cables };
    default:
      return state;
  }
}

interface TopologyContextValue {
  state: TopologyState;
  dispatch: Dispatch<TopologyAction>;
}

const TopologyContext = createContext<TopologyContextValue | null>(null);

/** Provider store topologi facade — bungkus app dengan ini untuk memakai useTopology. */
export function TopologyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(topologyReducer, INITIAL_TOPOLOGY_STATE);
  return (
    <TopologyContext.Provider value={{ state, dispatch }}>{children}</TopologyContext.Provider>
  );
}

/**
 * Hook akses store topologi. Lempar error bila dipakai di luar TopologyProvider.
 */
export function useTopology(): TopologyContextValue {
  const ctx = useContext(TopologyContext);
  if (!ctx) {
    throw new Error('useTopology must be used within a TopologyProvider');
  }
  return ctx;
}