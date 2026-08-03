import { LabProject } from '../types';

export interface SharePayload {
  project: LabProject;
  configs?: Record<string, any>;
}

const PARAM = 'lab';

/** Encode project + CLI configs ke base64url yang aman untuk URL. */
export function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode payload dari URL. Mengembalikan null bila tidak valid. */
export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json);
    if (!parsed || !parsed.project || !Array.isArray(parsed.project.nodes) || !Array.isArray(parsed.project.edges)) {
      return null;
    }
    return parsed as SharePayload;
  } catch {
    return null;
  }
}

export const SHARE_PARAM = PARAM;
