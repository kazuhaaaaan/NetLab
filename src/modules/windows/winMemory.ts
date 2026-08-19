// Helper state Windows Client — baca/tulis memory vendor (files, websites)
// dengan cara yang aman (tanpa mengubah bentuk NodeMemory).
import type { NodeMemory } from '../../../packages/vendors/src/common/types';

export interface WinFile {
  name: string;
  content: string;
}

export interface WinWebsite {
  hostname: string;
  port: number;
  content: string;
  enabled: boolean;
}

export const winFilesOf = (mem: NodeMemory): WinFile[] =>
  Array.isArray(mem.files) ? (mem.files as WinFile[]) : [];

export const winWebsitesOf = (mem: NodeMemory): WinWebsite[] =>
  Array.isArray(mem.websites) ? (mem.websites as WinWebsite[]) : [];

export function winSetFiles(mem: NodeMemory, files: WinFile[]): void {
  mem.files = files;
}

export function winSetWebsites(mem: NodeMemory, websites: WinWebsite[]): void {
  mem.websites = websites;
}

/** Website aktif pertama (yang enabled) — engine hanya melayani SATU
 *  webServer per perangkat (port + konten), jujur dengan keterbatasan ini. */
export function activeWebsite(websites: WinWebsite[]): WinWebsite | null {
  return websites.find((w) => w.enabled) ?? null;
}